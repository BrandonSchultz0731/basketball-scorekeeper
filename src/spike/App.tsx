import {
  Accordion, Alert, Badge, Button, Code, Container, FileInput, Group, NativeSelect,
  NumberInput, Paper, Stack, Text, Title, useMantineTheme,
} from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Section, StatList } from '../shared/components';
import {
  BACKEND, CROP_SCALES, DETECTOR_MODEL, MODELS, WORKER_MESSAGE_TYPE, createDetectorWorker, cropScaleLabel, type WorkerIn, type WorkerOut,
} from '../shared/detector';
import { COCO_CLASS } from '../shared/enums';
import type { Detection } from '../shared/types';
import { fmt, percentile, watchFrameRate } from './stats';

const BASE = import.meta.env.BASE_URL;
const RESOLUTIONS = [
  { label: '4K (3840×2160)', w: 3840, h: 2160 },
  { label: '1440p', w: 2560, h: 1440 },
  { label: '1080p', w: 1920, h: 1080 },
  { label: '720p', w: 1280, h: 720 },
];

/** Best back camera by label: ultra-wide first, then any back/rear camera. iOS labels look like "Back Ultra Wide Camera". */
const pickBackCamera = (cams: MediaDeviceInfo[]): MediaDeviceInfo | undefined => {
  const back = cams.filter((d) => /back|rear|environment/i.test(d.label));
  return back.find((d) => /ultra/i.test(d.label)) ?? back[0];
};

enum FRAME_SOURCE {
  NONE = 'none',
  CAMERA = 'camera',
  FILE = 'file',
}

enum WAKE_LOCK_STATE {
  OFF = 'off',
  HELD = 'held',
  RELEASED = 'released',
  UNSUPPORTED = 'unsupported',
  FAILED = 'failed',
}

interface CropRect { sx: number; sy: number; side: number }

interface DetectionResult { dets: Detection[]; crop: CropRect; inputSize: number }

interface Timing {
  prep: number; infer: number; post: number; grab: number; total: number;
  /** Best ball in this run: confidence and width in camera pixels. null if no ball above threshold. */
  ball: { score: number; px: number } | null;
}

interface RunStats { count: number; first: Timing[]; recent: Timing[] }

const EMPTY_RUN_STATS: RunStats = { count: 0, first: [], recent: [] };
const FIRST_N = 50;
const RECENT_N = 200;

const addRun = (r: RunStats, t: Timing): RunStats => ({
  count: r.count + 1,
  first: r.first.length < FIRST_N ? [...r.first, t] : r.first,
  recent: r.recent.length < RECENT_N ? [...r.recent, t] : [...r.recent.slice(1), t],
});

export const App = () => {
  const mt = useMantineTheme();
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [res, setRes] = useState(0);
  const [fpsWanted, setFpsWanted] = useState(60);
  const [settings, setSettings] = useState<MediaTrackSettings | null>(null);
  const [caps, setCaps] = useState<MediaTrackCapabilities | null>(null);
  const [measuredFps, setMeasuredFps] = useState<{ fps: number; method: string } | null>(null);
  const [source, setSource] = useState(FRAME_SOURCE.NONE);
  const [error, setError] = useState('');

  const [wake, setWake] = useState({ state: WAKE_LOCK_STATE.OFF, releases: 0 });
  const wakeRef = useRef<WakeLockSentinel | null>(null);
  const wantWake = useRef(false);

  const [model, setModel] = useState(DETECTOR_MODEL.NANO);
  const [backend, setBackend] = useState(BACKEND.WEBGPU);
  const [ready, setReady] = useState<Extract<WorkerOut, { type: WORKER_MESSAGE_TYPE.READY }> | null>(null);
  const [loading, setLoading] = useState(false);
  const [cropScale, setCropScale] = useState(1);
  const [center, setCenter] = useState<{ x: number; y: number } | null>(null); // video pixels
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  // Run history: total count, the first 50 runs (cold, for the throttling comparison) and the last 200.
  const [runStats, setRunStats] = useState<RunStats>(EMPTY_RUN_STATS);
  // Detections plus the crop they were cut from, so boxes are drawn where the model actually looked.
  const [lastResult, setLastResult] = useState<DetectionResult | null>(null);
  const lastDets = lastResult?.dets ?? [];
  // When the current/last run started and ended (performance.now() ms). end is null while running.
  const [runSpan, setRunSpan] = useState<{ start: number; end: number | null } | null>(null);
  const [threshold, setThreshold] = useState(0.25);
  const [snapshot, setSnapshot] = useState<typeof report | null>(null);
  const clipboard = useClipboard({ timeout: 1500 });

  // ---------- camera ----------
  const refreshDevices = useCallback(async () => {
    const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    setDevices(all);
    return all;
  }, []);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const openCamera = useCallback(async (id: string, resIdx: number, fps: number) => {
    setError('');
    stopStream();
    const r = RESOLUTIONS[resIdx];
    const request = (camera: MediaTrackConstraints) => navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { ...camera, width: { ideal: r.w }, height: { ideal: r.h }, frameRate: { ideal: fps } },
    });
    try {
      let stream: MediaStream;
      if (id) {
        stream = await request({ deviceId: { exact: id } });
      } else {
        // `ideal` is only a hint that Safari trades off against resolution and frame rate, which can
        // land on the front camera. Require the back camera; fall back only if there is none (laptops).
        try {
          stream = await request({ facingMode: { exact: 'environment' } });
        } catch (err) {
          if (!(err instanceof DOMException && err.name === 'OverconstrainedError')) throw err;
          stream = await request({});
        }
      }
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      setSettings(track.getSettings());
      setCaps(track.getCapabilities?.() ?? null);
      const v = videoRef.current!;
      v.src = '';
      v.srcObject = stream;
      await v.play();
      setSource(FRAME_SOURCE.CAMERA);
      const list = await refreshDevices();
      if (!id) {
        // First open: labels are only available after permission, so pick the best back camera now.
        const preferred = pickBackCamera(list);
        const current = track.getSettings().deviceId ?? '';
        if (preferred && preferred.deviceId !== current) {
          setDeviceId(preferred.deviceId);
          return openCamera(preferred.deviceId, resIdx, fps);
        }
        setDeviceId(current);
      }
    } catch (err) {
      setError(`getUserMedia: ${err instanceof Error ? `${err.name}: ${err.message}` : err}`);
    }
  }, [refreshDevices]);

  const applyMinZoom = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    const z = (caps as { zoom?: { min: number } } | null)?.zoom;
    if (!track || !z) return;
    try {
      await track.applyConstraints({ advanced: [{ zoom: z.min } as MediaTrackConstraintSet] });
      setSettings(track.getSettings());
    } catch (err) { setError(`zoom: ${err}`); }
  };

  const openFile = (f: File) => {
    stopStream();
    const v = videoRef.current!;
    v.srcObject = null;
    v.src = URL.createObjectURL(f);
    v.loop = true;
    v.muted = true;
    v.play();
    setSource(FRAME_SOURCE.FILE);
    setSettings(null);
    setCaps(null);
  };

  useEffect(() => {
    const v = videoRef.current!;
    return watchFrameRate(v, (fps, method) => setMeasuredFps({ fps, method }));
  }, []);

  // ---------- wake lock ----------
  const acquireWake = useCallback(async () => {
    if (!('wakeLock' in navigator)) { setWake((w) => ({ ...w, state: WAKE_LOCK_STATE.UNSUPPORTED })); return; }
    try {
      const s = await navigator.wakeLock.request('screen');
      wakeRef.current = s;
      setWake((w) => ({ ...w, state: WAKE_LOCK_STATE.HELD }));
      s.addEventListener('release', () => setWake((w) => ({ state: WAKE_LOCK_STATE.RELEASED, releases: w.releases + 1 })));
    } catch (err) {
      setWake((w) => ({ ...w, state: WAKE_LOCK_STATE.FAILED }));
      setError(`wake lock: ${err instanceof Error ? err.message : err}`);
    }
  }, []);

  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible' && wantWake.current) acquireWake(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [acquireWake]);

  // ---------- detector ----------
  // Size of the loaded model, or of the selected one before anything is loaded.
  const inputSize = ready?.size ?? MODELS[model].size;
  const cropPx = Math.round(inputSize * cropScale); // source pixels in the crop square

  const unloadDetector = () => {
    runningRef.current = false;
    setRunning(false); // an in-flight run on the terminated worker never resolves
    workerRef.current?.terminate();
    workerRef.current = null;
    setReady(null);
    setLoading(false);
    setRunStats(EMPTY_RUN_STATS);
    setLastResult(null);
  };

  const initDetector = () => {
    workerRef.current?.terminate();
    setReady(null);
    setLoading(true);
    setError('');
    const w = createDetectorWorker();
    workerRef.current = w;
    w.onmessage = (e: MessageEvent<WorkerOut>) => {
      if (e.data.type === WORKER_MESSAGE_TYPE.READY) { setReady(e.data); setLoading(false); }
      if (e.data.type === WORKER_MESSAGE_TYPE.ERROR) { setError(`worker: ${e.data.message}`); setLoading(false); }
    };
    const abs = (p: string) => new URL(p, location.origin).href;
    w.postMessage({
      type: WORKER_MESSAGE_TYPE.INIT, model, backend, size: MODELS[model].size, classes: MODELS[model].classes,
      modelUrl: abs(`${BASE}models/${MODELS[model].file}`),
    } satisfies WorkerIn);
  };

  // The run loop is started once and keeps going across renders, so anything it reads must come
  // from this ref, not from the render it started in. Otherwise it keeps the old crop and threshold.
  const live = useRef({ center, cropPx, threshold, inputSize });
  live.current = { center, cropPx, threshold, inputSize };

  const cropRect = (): CropRect => {
    const v = videoRef.current!;
    const vw = v.videoWidth, vh = v.videoHeight;
    const side = Math.min(live.current.cropPx, vw, vh);
    const c = live.current.center ?? { x: vw / 2, y: vh / 2 };
    const sx = Math.round(Math.max(0, Math.min(vw - side, c.x - side / 2)));
    const sy = Math.round(Math.max(0, Math.min(vh - side, c.y - side / 2)));
    return { sx, sy, side };
  };

  const grab = async (): Promise<{ bitmap: ImageBitmap; crop: CropRect; size: number }> => {
    const v = videoRef.current!;
    const crop = cropRect();
    const { sx, sy, side } = crop;
    const size = live.current.inputSize;
    try {
      return { bitmap: await createImageBitmap(v, sx, sy, side, side, { resizeWidth: size, resizeHeight: size }), crop, size };
    } catch {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      c.getContext('2d')!.drawImage(v, sx, sy, side, side, 0, 0, size, size);
      return { bitmap: await createImageBitmap(c), crop, size };
    }
  };

  const runOnce = (id: number): Promise<Timing> => new Promise(async (resolve, reject) => {
    const w = workerRef.current!;
    const t0 = performance.now();
    const { bitmap, crop, size } = await grab();
    const grabMs = performance.now() - t0;
    const onMsg = (e: MessageEvent<WorkerOut>) => {
      const m = e.data;
      if (m.type === WORKER_MESSAGE_TYPE.ERROR) { w.removeEventListener('message', onMsg); reject(new Error(m.message)); }
      if (m.type === WORKER_MESSAGE_TYPE.RESULT && m.id === id) {
        w.removeEventListener('message', onMsg);
        setLastResult({ dets: m.dets, crop, inputSize: size });
        const best = m.dets.filter((d) => d.cls === COCO_CLASS.SPORTS_BALL).sort((a, b) => b.score - a.score)[0];
        const ball = best ? { score: best.score, px: (best.w * crop.side) / size } : null;
        resolve({ grab: grabMs, prep: m.prepMs, infer: m.inferMs, post: m.postMs, total: performance.now() - t0, ball });
      }
    };
    w.addEventListener('message', onMsg);
    w.postMessage({ type: WORKER_MESSAGE_TYPE.RUN, id, bitmap, threshold: live.current.threshold } satisfies WorkerIn, [bitmap]);
  });

  const start = async (limit: number) => {
    if (!ready || runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setRunStats(EMPTY_RUN_STATS);
    setRunSpan({ start: performance.now(), end: null });
    try {
      for (let i = 0; runningRef.current && i < limit; i++) {
        const t = await runOnce(i);
        setRunStats((r) => addRun(r, t));
      }
    } catch (err) {
      setError(`run: ${err}`);
    }
    runningRef.current = false;
    setRunning(false);
    setRunSpan((span) => span && { ...span, end: performance.now() });
  };

  // ---------- overlay ----------
  useEffect(() => {
    const v = videoRef.current, c = overlayRef.current;
    if (!v || !c || !v.videoWidth) return;
    c.width = v.clientWidth * devicePixelRatio;
    c.height = v.clientHeight * devicePixelRatio;
    const k = c.width / v.videoWidth;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    const { sx, sy, side } = cropRect();
    g.lineWidth = 2 * devicePixelRatio;
    g.strokeStyle = mt.colors.orange[5];
    g.strokeRect(sx * k, sy * k, side * k, side * k);
    if (lastResult) {
      const { crop, inputSize: size, dets } = lastResult;
      const s = crop.side / size;
      for (const d of dets) {
        g.strokeStyle = d.cls === COCO_CLASS.SPORTS_BALL ? mt.colors.green[5] : mt.colors.blue[4];
        g.strokeRect((crop.sx + d.x * s) * k, (crop.sy + d.y * s) * k, d.w * s * k, d.h * s * k);
      }
    }
  });

  const onTapVideo = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const v = videoRef.current!;
    const r = e.currentTarget.getBoundingClientRect();
    setCenter({ x: ((e.clientX - r.left) / r.width) * v.videoWidth, y: ((e.clientY - r.top) / r.height) * v.videoHeight });
    setLastResult(null); // boxes from the old crop no longer apply
  };

  // ---------- report ----------
  const { count: runCount, recent } = runStats;
  // Ball detection over the last 200 runs, for the distance test.
  const ballHits = recent.flatMap((t) => (t.ball ? [t.ball] : []));
  const ballStats = {
    ballFramePct: recent.length ? +fmt((100 * ballHits.length) / recent.length) : null,
    ballScoreP50: ballHits.length ? +fmt(percentile(ballHits.map((b) => b.score), 50), 2) : null,
    ballPxP50: ballHits.length ? +fmt(percentile(ballHits.map((b) => b.px), 50), 0) : null,
  };
  const col = (k: Exclude<keyof Timing, 'ball'>) => recent.map((t) => t[k]);
  // Frozen once the run ends; while running it ticks because the page re-renders every video frame.
  const elapsed = runSpan && runCount ? ((runSpan.end ?? performance.now()) - runSpan.start) / 1000 : 0;
  const firstMin = runStats.first.map((t) => t.infer);
  const balls = lastDets.filter((d) => d.cls === COCO_CLASS.SPORTS_BALL);
  const report = {
    takenAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    source,
    camera: settings && {
      label: devices.find((d) => d.deviceId === settings.deviceId)?.label,
      width: settings.width, height: settings.height, frameRate: settings.frameRate, zoom: (settings as { zoom?: number }).zoom,
    },
    requested: { ...RESOLUTIONS[res], fps: fpsWanted },
    measuredFps: measuredFps && +measuredFps.fps.toFixed(1),
    devices: devices.map((d) => d.label),
    capabilities: caps,
    wakeLock: wake,
    detector: ready && {
      model: ready.model, inputSize: ready.size, backend: ready.backend, info: ready.info, loadMs: Math.round(ready.loadMs), warmupMs: Math.round(ready.warmupMs),
      cropSourcePx: cropPx, runs: runCount, elapsedS: +fmt(elapsed),
      inferP50: +fmt(percentile(col('infer'), 50)), inferP95: +fmt(percentile(col('infer'), 95)),
      totalP50: +fmt(percentile(col('total'), 50)), grabP50: +fmt(percentile(col('grab'), 50)),
      prepP50: +fmt(percentile(col('prep'), 50)), postP50: +fmt(percentile(col('post'), 50)),
      cropsPerS: +fmt(1000 / percentile(col('total'), 50)),
      threshold,
      ...ballStats,
      inferP50First50: +fmt(percentile(firstMin, 50)),
    },
  };

  // The report is a snapshot: live values (e.g. measured fps) keep changing, so what's shown and
  // what's copied must be the same frozen object.
  const takeSnapshot = () => {
    setSnapshot(report);
    clipboard.copy(JSON.stringify(report, null, 2));
  };

  const zoomCap = (caps as { zoom?: unknown } | null)?.zoom;
  const v = videoRef.current;
  const noSource = source === FRAME_SOURCE.NONE;

  return (
    <Container size="md" py="md">
      <Stack gap="lg">
        <Title order={2}>Camera &amp; inference spike</Title>
        {error && <Alert color="red" title="Error">{error}</Alert>}

        <Stack gap={4}>
          <Paper pos="relative" bg="black" style={{ overflow: 'hidden' }}>
            <video ref={videoRef} playsInline muted style={{ width: '100%', display: 'block', minHeight: 120 }} />
            <canvas ref={overlayRef} onPointerDown={onTapVideo}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }} />
          </Paper>
          <Text size="sm" c="dimmed">
            Tap the image to move the orange detector crop (e.g. onto a rim). Green = ball, blue = person.
          </Text>
        </Stack>

        <Section title="Source">
          <Group align="end">
            <Button onClick={() => openCamera(deviceId, res, fpsWanted)}>Open camera</Button>
            <FileInput placeholder="or pick a video file" accept="video/*" clearable={false}
              onChange={(f) => f && openFile(f)} w={220} />
          </Group>
          <Group align="end">
            <NativeSelect label="Camera" value={deviceId}
              data={[{ value: '', label: '(auto: back camera)' }, ...devices.map((d) => ({ value: d.deviceId, label: d.label || d.deviceId.slice(0, 8) }))]}
              onChange={(e) => { setDeviceId(e.currentTarget.value); openCamera(e.currentTarget.value, res, fpsWanted); }} />
            <NativeSelect label="Resolution" value={String(res)}
              data={RESOLUTIONS.map((r, i) => ({ value: String(i), label: r.label }))}
              onChange={(e) => { const n = +e.currentTarget.value; setRes(n); if (source === FRAME_SOURCE.CAMERA) openCamera(deviceId, n, fpsWanted); }} />
            <NativeSelect label="Frame rate" value={String(fpsWanted)}
              data={[30, 60, 120].map((f) => ({ value: String(f), label: `${f} fps` }))}
              onChange={(e) => { const n = +e.currentTarget.value; setFpsWanted(n); if (source === FRAME_SOURCE.CAMERA) openCamera(deviceId, res, n); }} />
            {zoomCap ? <Button variant="default" onClick={applyMinZoom}>Min zoom</Button> : null}
          </Group>
          <StatList rows={[
            ['Granted', settings ? `${settings.width}×${settings.height} @ ${fmt(settings.frameRate ?? NaN)} fps` : '–'],
            ['Measured', measuredFps ? `${fmt(measuredFps.fps)} fps (${measuredFps.method})` : '–'],
            ['Video', v?.videoWidth ? `${v.videoWidth}×${v.videoHeight}` : '–'],
            ['Camera', report.camera?.label ?? '–'],
            ['Zoom', report.camera?.zoom ?? 'n/a'],
          ]} />
        </Section>

        <Section title="Wake lock">
          <Group>
            <Button variant="default" onClick={() => { wantWake.current = true; acquireWake(); }}>Hold wake lock</Button>
            <Badge color={wake.state === WAKE_LOCK_STATE.HELD ? 'green' : 'gray'} variant="light">{wake.state}</Badge>
            <Text size="sm" c="dimmed">releases: {wake.releases}</Text>
          </Group>
        </Section>

        <Section title="Detector">
          <Group align="end">
            <NativeSelect label="Model" value={model}
              data={Object.values(DETECTOR_MODEL).map((m) => ({ value: m, label: `${MODELS[m].label} (${MODELS[m].size}², ${MODELS[m].megabytes} MB)` }))}
              onChange={(e) => { setModel(e.currentTarget.value as DETECTOR_MODEL); unloadDetector(); }} />
            <NativeSelect label="Backend" value={backend}
              data={[{ value: BACKEND.WEBGPU, label: 'WebGPU' }, { value: BACKEND.WASM, label: 'WASM' }]}
              onChange={(e) => { setBackend(e.currentTarget.value as BACKEND); unloadDetector(); }} />
            <NativeSelect label="Crop" value={String(cropScale)}
              data={CROP_SCALES.map((k) => ({ value: String(k), label: `${Math.round(inputSize * k)} px (${cropScaleLabel(k)})` }))}
              onChange={(e) => setCropScale(+e.currentTarget.value)} />
            <NumberInput label="Threshold" value={threshold} step={0.05} min={0.05} max={0.95} decimalScale={2} w={110}
              onChange={(n) => typeof n === 'number' && setThreshold(n)} />
            <Button onClick={initDetector} loading={loading}>Load model</Button>
          </Group>
          <Group>
            <Button variant="default" disabled={!ready || running || noSource} onClick={() => start(50)}>Benchmark 50</Button>
            <Button variant="default" disabled={!ready || running || noSource} onClick={() => start(Infinity)}>Run continuously</Button>
            <Button variant="light" color="red" disabled={!running} onClick={() => { runningRef.current = false; }}>Stop</Button>
          </Group>
          <StatList rows={[
            ['Loaded', ready ? `${MODELS[ready.model].label} ${ready.size}² on ${ready.backend} (${ready.info})` : '–'],
            ['Load / warm-up', ready ? `${fmt(ready.loadMs, 0)} ms / ${fmt(ready.warmupMs, 0)} ms` : '–'],
            ['Runs', `${runCount} in ${fmt(elapsed, 0)} s`],
            ['Inference p50 / p95', `${fmt(percentile(col('infer'), 50))} / ${fmt(percentile(col('infer'), 95))} ms (last 200)`],
            ['Inference p50, first 50', `${fmt(percentile(firstMin, 50))} ms (compare for throttling)`],
            ['Grab / prep / post p50', `${fmt(percentile(col('grab'), 50))} / ${fmt(percentile(col('prep'), 50))} / ${fmt(percentile(col('post'), 50))} ms`],
            ['Detector rate', `${fmt(1000 / percentile(col('total'), 50))} crops/s`],
            ['Ball, last 200 runs', ballStats.ballFramePct === null ? '–'
              : `found in ${ballStats.ballFramePct}% of frames${ballHits.length ? `, score p50 ${ballStats.ballScoreP50}, width p50 ${ballStats.ballPxP50} px` : ''}`],
            ['Last frame', `${balls.length} ball(s)${balls.length ? ` — ${balls.map((b) => `${fmt(b.score, 2)} @ ${fmt(lastResult ? (b.w * lastResult.crop.side) / lastResult.inputSize : NaN, 0)}px`).join(', ')}` : ''}, ${lastDets.length - balls.length} person(s)`],
          ]} />
        </Section>

        <Section title="Report">
          <Group>
            <Button color={clipboard.copied ? 'green' : undefined} onClick={takeSnapshot}>
              {clipboard.copied ? 'Copied' : 'Copy report'}
            </Button>
            <Text size="sm" c="dimmed">Captures every value at this moment, copies it, and shows it below.</Text>
          </Group>
          <Accordion variant="contained">
            <Accordion.Item value="raw">
              <Accordion.Control>Raw JSON{snapshot ? ` (snapshot ${new Date(snapshot.takenAt).toLocaleTimeString()})` : ''}</Accordion.Control>
              <Accordion.Panel>
                {snapshot
                  ? <Code block>{JSON.stringify(snapshot, null, 2)}</Code>
                  : <Text size="sm" c="dimmed">No snapshot yet. Tap Copy report.</Text>}
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Section>
      </Stack>
    </Container>
  );
};
