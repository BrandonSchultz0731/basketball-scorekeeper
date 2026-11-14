import { LABEL_EVENT_KIND, SAMPLE_KIND } from '../shared/enums';
import type { EvalEvent, LabelFile, Sample } from '../shared/types';
import { HOOPS } from '../shared/utils';

export interface SamplingOptions {
  /** Seconds before the label to start sampling. The ball is in the air above the rim during this time. */
  before: number;
  /** Seconds after the label to keep sampling. */
  after: number;
  /** Frames per second to sample at. */
  fps: number;
  /** Quiet frames per basket, spread evenly over the clip. */
  quietPerHoop: number;
  /** How far a quiet frame must be from any label at that basket, in seconds. */
  quietGap: number;
}

export const DEFAULT_SAMPLING: SamplingOptions = { before: 1, after: 0.2, fps: 30, quietPerHoop: 60, quietGap: 3 };

/**
 * The makes and tricky misses to evaluate: those at a basket whose rim is marked. Uncertain labels are left out,
 * since we don't know what really happened.
 */
export const evalEvents = (labels: LabelFile): EvalEvent[] =>
  [...labels.events]
    .sort((a, b) => a.t - b.t)
    .flatMap((e) => {
      if (e.kind !== LABEL_EVENT_KIND.MAKE && e.kind !== LABEL_EVENT_KIND.MISS) return [];
      if (e.uncertain || !labels.rims?.[e.hoop]) return [];
      return [e.kind === LABEL_EVENT_KIND.MAKE
        ? { kind: e.kind, hoop: e.hoop, t: e.t, points: e.points }
        : { kind: e.kind, hoop: e.hoop, t: e.t, ...(e.missType ? { missType: e.missType } : {}) }];
    })
    .map((e, id) => ({ id, ...e }));

/** Every frame to run, sorted by time so the video only seeks forward. */
export const planSamples = (labels: LabelFile, events: EvalEvent[], o: SamplingOptions = DEFAULT_SAMPLING): Sample[] => {
  const samples: Sample[] = [];
  const step = 1 / o.fps;
  for (const e of events) {
    const n = Math.round((o.before + o.after) * o.fps);
    for (let i = 0; i <= n; i++) {
      const t = e.t - o.before + i * step;
      if (t >= 0 && t <= labels.video.duration) samples.push({ kind: SAMPLE_KIND.EVENT, hoop: e.hoop, t: +t.toFixed(4), event: e.id });
    }
  }
  // Every labeled moment at a basket keeps quiet frames away, including uncertain ones.
  for (const hoop of HOOPS) {
    if (!labels.rims?.[hoop] || o.quietPerHoop <= 0) continue;
    const near = labels.events.flatMap((e) => ('hoop' in e && e.hoop === hoop ? [e.t] : []));
    const spacing = labels.video.duration / (o.quietPerHoop + 1);
    for (let i = 1; i <= o.quietPerHoop; i++) {
      const t = i * spacing;
      if (near.every((x) => Math.abs(x - t) >= o.quietGap)) samples.push({ kind: SAMPLE_KIND.QUIET, hoop, t: +t.toFixed(4) });
    }
  }
  return samples.sort((a, b) => a.t - b.t);
};
