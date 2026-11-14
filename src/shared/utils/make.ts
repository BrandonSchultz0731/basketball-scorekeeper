import type { HOOP } from '../enums';
import type { BallBox, BallSighting, MakeCall, MakeSettings, Rim } from '../types';

export const DEFAULT_MAKE_SETTINGS: MakeSettings = {
  minScore: 0.3,
  minSize: 0.25,
  maxSize: 0.9,
  staticWindow: 2,
  staticRadius: 0.15,
  staticShare: 0.7,
  trackGap: 0.35,
  gateBase: 0.5,
  maxSpeed: 20,
  netEntry: 0.3,
  belowNet: 0.5,
  netHalfWidth: 0.5,
  approachHalfWidth: 1,
  crossHalfWidth: 0.55,
  maxFall: 1,
  cooldown: 1.5,
};

interface Track {
  pts: BallSighting[];
  used: boolean;
}

/** Bottom of the net, or one rim width below the rim top if it wasn't marked. */
export const netBottomOf = (rim: Rim): number => rim.netBottom ?? rim.y + rim.width;

/**
 * Whether a ball track ends with a make: the ball is in the net now, and within `maxFall` seconds before that it was
 * above the rim and came down across the rim top near the middle. Returns when it was last above the rim.
 */
export const madeFrom = (pts: BallSighting[], rim: Rim, s: MakeSettings): number | null => {
  const w = rim.width;
  const last = pts[pts.length - 1];
  const netTop = rim.y + s.netEntry * (netBottomOf(rim) - rim.y);
  const inNet = last.y >= netTop && last.y <= netBottomOf(rim) + s.belowNet * w && Math.abs(last.x - rim.x) <= s.netHalfWidth * w;
  if (!inNet) return null;
  // Walk back to the most recent crossing of the rim top: the ball above it, then at or below it.
  for (let i = pts.length - 1; i > 0; i--) {
    const above = pts[i - 1], below = pts[i];
    if (last.t - above.t > s.maxFall) return null;
    if (above.y < rim.y && below.y >= rim.y) {
      const k = (rim.y - above.y) / (below.y - above.y);
      const crossX = above.x + k * (below.x - above.x);
      const ok = Math.abs(above.x - rim.x) <= s.approachHalfWidth * w && Math.abs(crossX - rim.x) <= s.crossHalfWidth * w;
      return ok ? above.t : null;
    }
  }
  return null;
};

/**
 * Make logic for one rim, fed frame by frame with the ball detections around it (video pixels). Returns a make when
 * one completes in this frame. Streaming, so the same code runs live on the phone and over recorded detections.
 */
export const createMakeDetector = (hoop: HOOP, rim: Rim, s: MakeSettings = DEFAULT_MAKE_SETTINGS) => {
  const w = rim.width;
  const history: { t: number; pts: BallSighting[] }[] = [];
  let tracks: Track[] = [];
  let lastMake = -Infinity;

  const isStatic = (b: BallSighting): boolean => {
    if (history.length === 0 || b.t - history[0].t < 0.9 * s.staticWindow) return false;
    const r = s.staticRadius * w;
    const hits = history.filter((h) => h.pts.some((p) => Math.hypot(p.x - b.x, p.y - b.y) <= r)).length;
    return hits >= s.staticShare * history.length;
  };

  const push = (t: number, boxes: BallBox[]): MakeCall | null => {
    const seen: BallSighting[] = boxes
      .map((b) => ({ t, x: b.x + b.w / 2, y: b.y + b.h / 2, size: Math.max(b.w, b.h), score: b.score }))
      .filter((b) => b.score >= s.minScore && b.size >= s.minSize * w && b.size <= s.maxSize * w);
    const moving = seen.filter((b) => !isStatic(b));
    history.push({ t, pts: seen });
    while (history.length && t - history[0].t > s.staticWindow) history.shift();

    tracks = tracks.filter((tr) => t - tr.pts[tr.pts.length - 1].t <= s.trackGap);
    const taken = new Set<Track>();
    const updated: Track[] = [];
    for (const b of [...moving].sort((a, c) => c.score - a.score)) {
      let best: Track | null = null, bestDist = Infinity;
      for (const tr of tracks) {
        if (taken.has(tr)) continue;
        const p = tr.pts[tr.pts.length - 1], q = tr.pts[tr.pts.length - 2];
        const dt = t - p.t;
        const vx = q ? (p.x - q.x) / (p.t - q.t) : 0, vy = q ? (p.y - q.y) / (p.t - q.t) : 0;
        const d = Math.hypot(b.x - (p.x + vx * dt), b.y - (p.y + vy * dt));
        if (d <= (s.gateBase + s.maxSpeed * dt) * w && d < bestDist) { best = tr; bestDist = d; }
      }
      const tr = best ?? { pts: [], used: false };
      if (!best) tracks.push(tr);
      tr.pts.push(b);
      taken.add(tr);
      updated.push(tr);
    }

    for (const tr of updated) {
      if (tr.used || t - lastMake < s.cooldown) continue;
      const fromT = madeFrom(tr.pts, rim, s);
      if (fromT !== null) {
        tr.used = true;
        lastMake = t;
        return { hoop, t, fromT, path: tr.pts.filter((p) => t - p.t <= s.maxFall) };
      }
    }
    return null;
  };

  return { push };
};

/** Runs the make logic over recorded detections: `frames[i]` holds the boxes of frame `i`, at `fps`. */
export const detectMakes = (hoop: HOOP, rim: Rim, frames: BallBox[][], fps: number, s: MakeSettings = DEFAULT_MAKE_SETTINGS): MakeCall[] => {
  const det = createMakeDetector(hoop, rim, s);
  const calls: MakeCall[] = [];
  frames.forEach((boxes, i) => {
    const call = det.push(i / fps, boxes);
    if (call) calls.push(call);
  });
  return calls;
};
