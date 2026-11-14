import { LABEL_EVENT_KIND, SAMPLE_KIND } from '../shared/enums';
import type { BallBox, EvalResults, FrameResult } from '../shared/types';
import { rimCrop } from '../shared/utils';
import { GUESS_SOURCE, type ReviewFrame } from './types';

/**
 * Seconds from the label to review around each make and tricky miss: the ball in the air, arriving at the rim,
 * in the net, and dropping out. The in-net frames are the ones the stock detector misses most.
 */
export const REVIEW_OFFSETS = [-0.9, -0.6, -0.4, -0.27, -0.13, 0, 0.13];
/** Quiet frames to review per basket, as examples of no ball (or a stray one). */
export const QUIET_PER_HOOP = 25;
/** The saved region, in rim widths. The largest crop the eval page tried, so any crop size can be cut from it. */
export const REGION_MULTIPLE = 10;
/** A detection counts as a ball only if its width is in this range, in rim widths. A real ball is about half a rim. */
export const BALL_SIZE_RANGE = [0.3, 0.8];
/** Lowest detector score used for a guess. */
export const GUESS_MIN_SCORE = 0.05;
/** How far apart two detections can be, in seconds, for the ball to be followed between them. */
export const FOLLOW_GAP = 0.6;

/** The best ball-sized detection in a frame, across all crop sizes. */
export const bestBall = (f: FrameResult, rimWidth: number): BallBox | null => {
  let best: BallBox | null = null;
  for (const balls of Object.values(f.balls)) {
    for (const b of balls) {
      const size = b.w / rimWidth;
      if (b.score < GUESS_MIN_SCORE || size < BALL_SIZE_RANGE[0] || size > BALL_SIZE_RANGE[1]) continue;
      if (!best || b.score > best.score) best = b;
    }
  }
  return best;
};

/**
 * A first guess for the frame at `t`: the detection there, or else a box moved in a straight line between the
 * nearest frames either side where a ball was detected, if they're close enough in time.
 */
export const guessAt = (frames: FrameResult[], t: number, rimWidth: number): ReviewFrame['guess'] => {
  const hits = frames
    .map((f) => ({ t: f.t, b: bestBall(f, rimWidth) }))
    .filter((h): h is { t: number; b: BallBox } => h.b !== null)
    .sort((a, b) => a.t - b.t);
  const here = hits.find((h) => Math.abs(h.t - t) < 1e-3);
  if (here) return { ...here.b, source: GUESS_SOURCE.DETECTED };
  const before = hits.filter((h) => h.t < t).at(-1);
  const after = hits.find((h) => h.t > t);
  if (!before || !after || after.t - before.t > FOLLOW_GAP) return null;
  const k = (t - before.t) / (after.t - before.t);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * k);
  return {
    x: mix(before.b.x, after.b.x), y: mix(before.b.y, after.b.y), w: mix(before.b.w, after.b.w), h: mix(before.b.h, after.b.h),
    score: 0, source: GUESS_SOURCE.FOLLOWED,
  };
};

/** The eval frame closest to `t`, if one is within half a frame. */
const frameNear = (frames: FrameResult[], t: number): FrameResult | undefined => {
  let best: FrameResult | undefined;
  for (const f of frames) if (!best || Math.abs(f.t - t) < Math.abs(best.t - t)) best = f;
  return best && Math.abs(best.t - t) <= 1 / 60 ? best : undefined;
};

/** Every frame to review for one clip, in time order, from that clip's eval results. */
export const planReview = (r: EvalResults): ReviewFrame[] => {
  const out: ReviewFrame[] = [];
  for (const e of r.events) {
    const rim = r.rims[e.hoop];
    if (!rim) continue;
    const frames = r.frames.filter((f) => f.kind === SAMPLE_KIND.EVENT && f.event === e.id);
    REVIEW_OFFSETS.forEach((offset, i) => {
      const f = frameNear(frames, e.t + offset);
      if (!f) return;
      out.push({
        id: `e${String(e.id).padStart(3, '0')}-${i}`,
        hoop: e.hoop, t: f.t,
        event: e.kind === LABEL_EVENT_KIND.MAKE
          ? { kind: e.kind, t: e.t, points: e.points }
          : { kind: e.kind, t: e.t, ...(e.missType ? { missType: e.missType } : {}) },
        region: rimCrop(rim, REGION_MULTIPLE, r.video.width, r.video.height),
        guess: guessAt(frames, f.t, rim.width),
      });
    });
  }
  for (const [hoop, rim] of Object.entries(r.rims)) {
    if (!rim) continue;
    const quiet = r.frames.filter((f) => f.kind === SAMPLE_KIND.QUIET && f.hoop === hoop);
    const step = Math.max(1, quiet.length / QUIET_PER_HOOP);
    for (let i = 0; i < quiet.length && out.filter((o) => !o.event && o.hoop === hoop).length < QUIET_PER_HOOP; i += step) {
      const f = quiet[Math.floor(i)];
      const b = bestBall(f, rim.width);
      out.push({
        id: `q-${f.hoop}-${f.t.toFixed(2)}`, hoop: f.hoop, t: f.t,
        region: rimCrop(rim, REGION_MULTIPLE, r.video.width, r.video.height),
        guess: b ? { ...b, source: GUESS_SOURCE.DETECTED } : null,
      });
    }
  }
  return out.sort((a, b) => a.t - b.t);
};
