// The live make pipeline on the camera phone. On every video frame (camera, or a file played as if it were the
// camera), at each marked rim:
//   1. keep a short buffer of the square around the rim, for the make/miss model;
//   2. check for motion on a thumbnail of the detector's crop, so the detector only runs where something moves;
// then run the ball detector on a rim with motion whenever it's free, feed its detections to that rim's make logic,
// and when the make logic calls a make, wait for the frames after it and ask the make/miss model. A confirmed make
// goes to `onMake`.
// It runs for a whole session, so the frame loop reads everything from refs (see the standards skill).
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BACKEND, LIVE_BALL_MODEL, MODELS, startDetector, startMakeCheck, type Detector, type MakeCheck,
} from '../shared/detector';
import { COCO_CLASS, FRAME_SOURCE, HOOP } from '../shared/enums';
import type { BallBox, Crop, MakeCall, Rim } from '../shared/types';
import {
  DEFAULT_RIM_CROP_MULTIPLE, HOOPS, createCheckScheduler, MAKE_CLIP, MAKE_CLIP_AFTER, clipFrameTimes, createMakeDetector, makeClipInput,
  motionLevel, rimCrop, rimSquare, toVideoBox,
} from '../shared/utils';
import { openBackCamera } from '../shared/video';

/** Detector input size (from the live model) and the lowest score kept (the make logic applies its own bar). */
const DETECT_SIZE = MODELS[LIVE_BALL_MODEL].size;
const DETECT_MIN_SCORE = 0.1;
/** Motion thumbnail size. What counts as motion, and which rim gets each check, is up to the check scheduler. */
const MOTION_SIZE = 32;
/**
 * Motion is watched in the detector's whole square around the rim, so the detector is already running while a shot
 * flies in. (A tight square around the rim only saw the ball a moment before it went through, too late.)
 */
const MOTION_MULTIPLE = DEFAULT_RIM_CROP_MULTIPLE;
/**
 * Checks allowed in flight at once. With one, a check could only start on the first video frame after the last one
 * finished, so a 45 ms check ran every other frame at best (15 a second). With two, the worker prepares the next
 * check while the model runs the current one.
 */
const MAX_IN_FLIGHT = 2;
/** Seconds of rim frames kept: the clip reaches 0.27 s before a call and the call can be a little late. */
const BUFFER_SECONDS = 2;
/** The make/miss model's bar for counting a make. */
export const MAKE_CHECK_THRESHOLD = 0.5;

/** A make the make logic called, and what the make/miss model said. */
export interface CameraCall {
  hoop: HOOP;
  /** Video time of the call, seconds. */
  t: number;
  /** The make/miss model's answer, or null while it's still waiting for frames. */
  p: number | null;
  scored: boolean;
  /** The frames the make/miss model looked at, side by side, as a PNG data URL, for checking what it saw. */
  strip?: string;
}

export interface CameraStatus {
  source: FRAME_SOURCE;
  running: boolean;
  /** Models loaded and ready, or loading now. */
  ready: boolean;
  loading: boolean;
  error: string;
  /** Frames arriving, and detector runs per rim, per second. */
  frameFps: number;
  detectFps: Record<HOOP, number>;
  /**
   * A check from start to answer, and its parts: cutting the rim's square out of the frame (on the page), then in the
   * worker. The rest is passing the square to the worker and the answer back.
   */
  detectMs: number;
  detectParts: { cutMs: number; prepMs: number; queueMs: number; inferMs: number; postMs: number };
  /** Average time spent on each video frame (cut-outs and motion check), ms. Must stay well under 33. */
  frameMs: number;
  /** Rims with recent motion. */
  active: Record<HOOP, boolean>;
  /** Most recent first. */
  calls: CameraCall[];
  frame: { width: number; height: number } | null;
}

/** One second of the status, kept for the log file. */
interface LogEntry {
  /** Seconds since watching started, and the video time. */
  at: number;
  videoTime: number;
  frameFps: number;
  frameMs: number;
  detectFps: Record<HOOP, number>;
  detectMs: number;
  detectParts: CameraStatus['detectParts'];
  active: Record<HOOP, boolean>;
  inFlight: number;
}

/** Seconds of status kept in the log: four hours. */
const LOG_LIMIT = 4 * 3600;

const round = (x: number, digits = 1) => Number(x.toFixed(digits));

/**
 * One buffered frame: both rims' clip squares side by side (left rim first), kept on the GPU as an ImageBitmap.
 * Pixels are only read back for the frames of a clip being checked: reading back every frame stalls on the GPU and
 * made each frame take longer than a frame lasts.
 */
interface Buffered { t: number; bitmap: ImageBitmap }

/** A canvas, GPU-backed (no `willReadFrequently`, which would copy every 4K video frame off the GPU when drawn). */
const canvas2d = (width: number, height = width) => {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c.getContext('2d')!;
};

/** Draws a square of the video into slot `i` of a strip of `size`-px squares. */
const drawSquare = (ctx: CanvasRenderingContext2D, v: HTMLVideoElement, c: Crop, i: number, size: number) =>
  ctx.drawImage(v, c.x, c.y, c.side, c.side, i * size, 0, size, size);

/**
 * Clip squares are buffered from every BUFFER_EVERY-th frame: the make/miss model uses every 3rd frame, so the
 * nearest buffered one is at most a frame off, and the phone has half the drawing to do.
 */
const BUFFER_EVERY = 2;
/** The motion check runs on every MOTION_EVERY-th frame, with one small read-back for both rims. */
const MOTION_EVERY = 4;

/** Square `slot` out of RGBA pixels of `count` `size`-px squares side by side. */
const rowsOf = (all: Uint8ClampedArray, slot: number, size: number, count: number): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const from = (y * size * count + slot * size) * 4;
    out.set(all.subarray(from, from + size * 4), y * size * 4);
  }
  return out;
};

/** The pixels of one rim's square from a buffered frame. */
const readSquare = (ctx: CanvasRenderingContext2D, bitmap: ImageBitmap, slot: number): Uint8ClampedArray => {
  const size = MAKE_CLIP.size;
  ctx.drawImage(bitmap, slot * size, 0, size, size, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size).data;
};

/** Clip frames side by side in one image, for the "save clip" button. */
const toStrip = (frames: Uint8ClampedArray[]): string => {
  const size = MAKE_CLIP.size;
  const c = document.createElement('canvas');
  c.width = size * frames.length;
  c.height = size;
  const ctx = c.getContext('2d')!;
  frames.forEach((f, i) => ctx.putImageData(new ImageData(new Uint8ClampedArray(f), size, size), i * size, 0));
  return c.toDataURL('image/png');
};

const nearest = (buf: Buffered[], t: number): Buffered | undefined =>
  buf.reduce<Buffered | undefined>((best, f) => (!best || Math.abs(f.t - t) < Math.abs(best.t - t) ? f : best), undefined);

const NO_PARTS = { cutMs: 0, prepMs: 0, queueMs: 0, inferMs: 0, postMs: 0 };
const zeroByHoop = <T,>(v: T): Record<HOOP, T> => ({ [HOOP.LEFT]: v, [HOOP.RIGHT]: v });
const hoopSlot = (hoop: HOOP) => HOOPS.indexOf(hoop);

/**
 * The moment the make/miss clip is centered on. Training clips were centered on calls made at 30 fps, which come
 * about 0.1 s after the ball was last seen above the rim. Live, the detector runs less often, so a call can come
 * late; centering on the crossing keeps the clip on the ball going through instead of an empty net.
 */
const CROSS_TO_CALL = 0.1;
const clipAnchor = (call: MakeCall): number => Math.min(call.t, call.fromT + CROSS_TO_CALL);

export const useCameraScorer = (rims: Partial<Record<HOOP, Rim>>, onMake: (hoop: HOOP) => void) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<CameraStatus>({
    source: FRAME_SOURCE.NONE, running: false, ready: false, loading: false, error: '', frameFps: 0,
    detectFps: zeroByHoop(0), detectMs: 0, detectParts: NO_PARTS, frameMs: 0, active: zeroByHoop(false), calls: [], frame: null,
  });

  // Everything the frame loop touches lives here, so it always sees the latest values.
  const s = useRef({
    rims, onMake,
    running: false,
    source: FRAME_SOURCE.NONE,
    detector: null as Detector | null,
    makeCheck: null as MakeCheck | null,
    /** The models' load in progress, shared by every caller, so repeated taps can't load a second copy. */
    loadingModels: null as Promise<void> | null,
    /** Checks started and not yet answered. */
    inFlight: 0,
    stream: null as MediaStream | null,
    fileUrl: '',
    squareCtx: null as CanvasRenderingContext2D | null,
    motionCtx: null as CanvasRenderingContext2D | null,
    readCtx: null as CanvasRenderingContext2D | null,
    detectCtx: null as CanvasRenderingContext2D | null,
    buffer: [] as Buffered[],
    motionPrev: zeroByHoop<Uint8ClampedArray | null>(null),
    scheduler: createCheckScheduler(HOOPS),
    makers: {} as Partial<Record<HOOP, ReturnType<typeof createMakeDetector>>>,
    pending: [] as MakeCall[],
    calls: [] as CameraCall[],
    frames: 0,
    runs: zeroByHoop(0),
    msSum: 0,
    parts: { ...NO_PARTS },
    frameMsSum: 0,
    statsAt: performance.now(),
    log: [] as LogEntry[],
    startedAt: 0,
  });
  s.current.rims = rims;
  s.current.onMake = onMake;

  const fail = (err: unknown) => setStatus((st) => ({ ...st, error: err instanceof Error ? err.message : String(err) }));

  // New rim markings mean new make logic state. Compared by value: the settings object can be rebuilt unchanged.
  const rimsKey = JSON.stringify(rims);
  useEffect(() => {
    s.current.makers = {};
    s.current.buffer.forEach((f) => f.bitmap.close());
    s.current.buffer = [];
    s.current.motionPrev = zeroByHoop(null);
  }, [rimsKey]);

  const detect = useCallback(async (hoop: HOOP, t: number) => {
    const st = s.current, v = videoRef.current, rim = st.rims[hoop];
    if (!st.detector || !v || !rim || !st.detectCtx) return;
    st.inFlight++;
    st.scheduler.ran(hoop, t);
    try {
      const crop = rimCrop(rim, DEFAULT_RIM_CROP_MULTIPLE, v.videoWidth, v.videoHeight);
      const t0 = performance.now();
      // Drawn into a GPU canvas, then snapshotted. Cropping straight from the video with createImageBitmap was slower
      // on the iPhone (Safari 18): 25 ms instead of 18 to cut out, and slower for the worker to read.
      st.detectCtx.drawImage(v, crop.x, crop.y, crop.side, crop.side, 0, 0, DETECT_SIZE, DETECT_SIZE);
      const bitmap = await createImageBitmap(st.detectCtx.canvas);
      st.parts.cutMs += performance.now() - t0;
      const { dets, ...parts } = await st.detector.run(bitmap, DETECT_MIN_SCORE);
      st.msSum += performance.now() - t0;
      st.parts.prepMs += parts.prepMs; st.parts.queueMs += parts.queueMs;
      st.parts.inferMs += parts.inferMs; st.parts.postMs += parts.postMs;
      st.runs[hoop]++;
      const boxes: BallBox[] = dets.filter((d) => d.cls === COCO_CLASS.SPORTS_BALL).map((d) => {
        const b = toVideoBox(d, crop, DETECT_SIZE);
        return { x: b.x, y: b.y, w: b.w, h: b.h, score: b.score };
      });
      st.makers[hoop] ??= createMakeDetector(hoop, rim);
      const call = st.makers[hoop]!.push(t, boxes);
      // Only a ball in play counts, not one sitting by the wall, which would keep the detector at that rim.
      st.scheduler.ball(hoop, st.makers[hoop]!.lastMovingBall());
      if (call) {
        st.pending.push(call);
        st.calls = [{ hoop, t: call.t, p: null, scored: false }, ...st.calls].slice(0, 20);
      }
    } catch (err) {
      fail(err);
    } finally {
      st.inFlight--;
    }
  }, []);

  /** Asks the make/miss model about a call once the frames after it have arrived. */
  const check = useCallback(async (call: MakeCall) => {
    const st = s.current;
    const picked = clipFrameTimes(clipAnchor(call)).map((ft) => nearest(st.buffer, ft));
    const frames = picked.map((f) => (f && st.readCtx ? readSquare(st.readCtx, f.bitmap, hoopSlot(call.hoop)) : undefined));
    const entry = st.calls.find((c) => c.hoop === call.hoop && c.t === call.t);
    if (!st.makeCheck || frames.some((f) => !f)) return;
    if (entry) entry.strip = toStrip(frames as Uint8ClampedArray[]);
    try {
      const p = await st.makeCheck.run(makeClipInput(frames as Uint8ClampedArray[]));
      const scored = p >= MAKE_CHECK_THRESHOLD;
      if (entry) { entry.p = p; entry.scored = scored; }
      if (scored) st.onMake(call.hoop);
    } catch (err) {
      fail(err);
    }
  }, []);

  const onFrame = useCallback((t: number) => {
    const st = s.current, v = videoRef.current;
    if (!st.running || !v || !st.squareCtx || !st.motionCtx) return;
    const t0 = performance.now();
    st.frames++;
    const W = v.videoWidth, H = v.videoHeight;
    // Both rims' clip squares into one strip, snapshotted as a bitmap that stays on the GPU.
    if (st.frames % BUFFER_EVERY === 0) {
      for (const hoop of HOOPS) {
        const rim = st.rims[hoop];
        if (rim) drawSquare(st.squareCtx, v, rimSquare(rim, W, H), hoopSlot(hoop), MAKE_CLIP.size);
      }
      void createImageBitmap(st.squareCtx.canvas).then((bitmap) => {
        st.buffer.push({ t, bitmap });
        while (st.buffer.length && t - st.buffer[0].t > BUFFER_SECONDS) st.buffer.shift()!.bitmap.close();
      });
    }
    // Motion: both rims' thumbnails, one read-back, every few frames.
    if (st.frames % MOTION_EVERY === 0) {
      for (const hoop of HOOPS) {
        const rim = st.rims[hoop];
        if (rim) drawSquare(st.motionCtx, v, rimCrop(rim, MOTION_MULTIPLE, W, H), hoopSlot(hoop), MOTION_SIZE);
      }
      const all = st.motionCtx.getImageData(0, 0, MOTION_SIZE * HOOPS.length, MOTION_SIZE).data;
      for (const hoop of HOOPS) {
        if (!st.rims[hoop]) continue;
        const thumb = rowsOf(all, hoopSlot(hoop), MOTION_SIZE, HOOPS.length);
        const prev = st.motionPrev[hoop];
        if (prev) st.scheduler.motion(hoop, t, motionLevel(prev, thumb));
        st.motionPrev[hoop] = thumb;
      }
    }
    st.frameMsSum += performance.now() - t0;
    // The scheduler picks the rim (src/shared/utils/checkScheduler.ts, the same rules the make eval simulates).
    // Up to MAX_IN_FLIGHT checks can start on one frame, each on a different rim. One check per frame capped the
    // checks at the frame rate (about 24 a second on the phone), while the model alone could do far more.
    const started: HOOP[] = [];
    while (st.inFlight < MAX_IN_FLIGHT) {
      const next = st.scheduler.next(t);
      if (!next || started.includes(next)) break;
      started.push(next);
      void detect(next, t);
    }
    const due = st.pending.filter((c) => t >= clipAnchor(c) + MAKE_CLIP_AFTER + 1 / MAKE_CLIP.fps);
    st.pending = st.pending.filter((c) => !due.includes(c));
    due.forEach((c) => void check(c));

    const now = performance.now();
    if (now - st.statsAt >= 1000) {
      // Work the numbers out now: the counters are reset below, before React runs the state update.
      const secs = (now - st.statsAt) / 1000;
      const runs = st.runs[HOOP.LEFT] + st.runs[HOOP.RIGHT];
      const next = {
        frameFps: st.frames / secs,
        detectFps: { [HOOP.LEFT]: st.runs[HOOP.LEFT] / secs, [HOOP.RIGHT]: st.runs[HOOP.RIGHT] / secs },
        detectMs: runs ? st.msSum / runs : 0,
        detectParts: {
          cutMs: runs ? st.parts.cutMs / runs : 0,
          prepMs: runs ? st.parts.prepMs / runs : 0, queueMs: runs ? st.parts.queueMs / runs : 0,
          inferMs: runs ? st.parts.inferMs / runs : 0, postMs: runs ? st.parts.postMs / runs : 0,
        },
        frameMs: st.frames ? st.frameMsSum / st.frames : 0,
        active: { [HOOP.LEFT]: st.scheduler.busy(HOOP.LEFT, t), [HOOP.RIGHT]: st.scheduler.busy(HOOP.RIGHT, t) },
        calls: st.calls.map((c) => ({ ...c })),
      };
      setStatus((old) => ({ ...old, ...next }));
      if (st.log.length < LOG_LIMIT) {
        st.log.push({
          at: round((now - st.startedAt) / 1000), videoTime: round(t, 2),
          frameFps: round(next.frameFps), frameMs: round(next.frameMs),
          detectFps: { [HOOP.LEFT]: round(next.detectFps[HOOP.LEFT]), [HOOP.RIGHT]: round(next.detectFps[HOOP.RIGHT]) },
          detectMs: round(next.detectMs),
          detectParts: {
            cutMs: round(next.detectParts.cutMs), prepMs: round(next.detectParts.prepMs), queueMs: round(next.detectParts.queueMs),
            inferMs: round(next.detectParts.inferMs), postMs: round(next.detectParts.postMs),
          },
          active: next.active, inFlight: st.inFlight,
        });
      }
      st.frames = 0; st.runs = zeroByHoop(0); st.msSum = 0; st.parts = { ...NO_PARTS }; st.frameMsSum = 0; st.statsAt = now;
    }
  }, [detect, check]);

  // The frame loop: one callback per video frame, with that frame's own timestamp.
  useEffect(() => {
    const v = videoRef.current;
    if (!status.running || !v) return;
    let handle = 0;
    const tick = (_now: number, meta: VideoFrameCallbackMetadata) => {
      onFrame(meta.mediaTime);
      handle = v.requestVideoFrameCallback(tick);
    };
    handle = v.requestVideoFrameCallback(tick);
    return () => v.cancelVideoFrameCallback(handle);
  }, [status.running, onFrame]);

  /** Loads both models once. */
  const loadModels = useCallback((): Promise<void> => {
    const st = s.current;
    if (st.detector && st.makeCheck) return Promise.resolve();
    st.squareCtx ??= canvas2d(MAKE_CLIP.size * HOOPS.length, MAKE_CLIP.size);
    st.motionCtx ??= canvas2d(MOTION_SIZE * HOOPS.length, MOTION_SIZE);
    st.readCtx ??= canvas2d(MAKE_CLIP.size);
    st.detectCtx ??= canvas2d(DETECT_SIZE);
    if (!st.loadingModels) {
      setStatus((old) => ({ ...old, loading: true }));
      // One at a time: the ball model is the big one, and loading both at once adds to the peak memory.
      st.loadingModels = (async () => {
        st.detector ??= await startDetector(LIVE_BALL_MODEL, BACKEND.WEBGPU);
        st.makeCheck ??= await startMakeCheck();
        setStatus((old) => ({ ...old, ready: true }));
      })().finally(() => {
        st.loadingModels = null;
        setStatus((old) => ({ ...old, loading: false }));
      });
    }
    return st.loadingModels;
  }, []);

  const stop = useCallback(() => {
    s.current.running = false;
    if (s.current.source === FRAME_SOURCE.FILE) videoRef.current?.pause();
    setStatus((old) => ({ ...old, running: false }));
  }, []);

  const releaseSource = () => {
    const st = s.current;
    st.stream?.getTracks().forEach((t) => t.stop());
    st.stream = null;
    if (st.fileUrl) URL.revokeObjectURL(st.fileUrl);
    st.fileUrl = '';
  };

  const showFrame = (source: FRAME_SOURCE) => {
    const v = videoRef.current!;
    s.current.source = source;
    setStatus((old) => ({ ...old, source, error: '', frame: { width: v.videoWidth, height: v.videoHeight } }));
  };

  const openCamera = useCallback(async () => {
    try {
      stop();
      releaseSource();
      const stream = await openBackCamera();
      s.current.stream = stream;
      const v = videoRef.current!;
      v.src = '';
      v.srcObject = stream;
      v.muted = true;
      await v.play();
      showFrame(FRAME_SOURCE.CAMERA);
    } catch (err) {
      fail(err);
    }
  }, [stop]);

  const openFile = useCallback(async (file: File) => {
    try {
      stop();
      releaseSource();
      const v = videoRef.current!;
      v.srcObject = null;
      s.current.fileUrl = URL.createObjectURL(file);
      v.src = s.current.fileUrl;
      v.muted = true;
      await new Promise<void>((ok, bad) => {
        v.onloadedmetadata = () => ok();
        v.onerror = () => bad(new Error('this video file could not be opened'));
      });
      showFrame(FRAME_SOURCE.FILE);
    } catch (err) {
      fail(err);
    }
  }, [stop]);

  /** Starts watching: loads the models if needed, then plays the file or keeps the camera running. */
  const start = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      await loadModels();
      const st = s.current;
      st.makers = {};
      st.scheduler = createCheckScheduler(HOOPS.filter((h) => st.rims[h]));
      st.pending = [];
      st.log = [];
      st.calls = [];
      st.startedAt = performance.now();
      st.statsAt = st.startedAt;
      st.frames = 0; st.runs = zeroByHoop(0); st.msSum = 0; st.parts = { ...NO_PARTS }; st.frameMsSum = 0;
      st.running = true;
      if (v.paused) await v.play();
      setStatus((old) => ({ ...old, running: true, error: '' }));
    } catch (err) {
      fail(err);
    }
  }, [loadModels]);

  // Release the camera and workers when the tab goes away.
  useEffect(() => () => {
    releaseSource();
    s.current.detector?.stop();
    s.current.makeCheck?.stop();
  }, []);

  /**
   * Everything about the last watch, as JSON for a file: the phone, the model, the rims, the status every second
   * and each make. For sending to whoever is tuning the app.
   */
  const exportLog = useCallback((): string => {
    const st = s.current, v = videoRef.current;
    return JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      source: st.source,
      video: v ? { width: v.videoWidth, height: v.videoHeight, time: v.currentTime } : null,
      model: { ball: LIVE_BALL_MODEL, size: DETECT_SIZE, maxInFlight: MAX_IN_FLIGHT, makeCheckThreshold: MAKE_CHECK_THRESHOLD },
      rims: st.rims,
      seconds: st.log,
      calls: st.calls.map(({ strip: _strip, ...c }) => c),
    }, null, 1);
  }, []);

  return { videoRef, status, openCamera, openFile, start, stop, exportLog };
};
