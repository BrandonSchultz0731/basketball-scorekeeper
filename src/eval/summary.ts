import { LABEL_EVENT_KIND, SAMPLE_KIND, type HOOP } from '../shared/enums';
import { HOOPS, rimCrop } from '../shared/utils';
import type { EvalResults, FrameResult } from '../shared/types';

/** Detector scores the summary is reported at. */
export const SUMMARY_THRESHOLDS = [0.1, 0.25, 0.5];

/** Seconds before a label that count as "the ball should be right at the rim". */
export const NEAR_WINDOW = 0.5;

export interface EventStats {
  /** Events with frames. */
  n: number;
  /** Share of events where the ball was found in at least 1 frame. */
  seen: number;
  /** Share of events where the ball was found in at least 3 frames. */
  seen3: number;
  /** Share of frames in the last `NEAR_WINDOW` seconds before the label with a ball found, averaged over events. */
  nearFrames: number;
}

export interface SummaryRow {
  hoop: HOOP;
  rimWidth: number;
  multiple: number;
  threshold: number;
  makes: EventStats;
  misses: EventStats;
  /** Quiet frames, and the share with a ball found. */
  quiet: { n: number; rate: number };
  /** Median width of found balls, in video pixels and as the detector saw it. NaN if none. */
  ballPx: number;
  ballInputPx: number;
}

const median = (xs: number[]): number => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const hasBall = (f: FrameResult, multiple: number, threshold: number) => (f.balls[multiple] ?? []).some((b) => b.score >= threshold);

/** One row per basket, crop size and threshold. */
export const summarize = (r: EvalResults): SummaryRow[] => {
  const byEvent = new Map<number, FrameResult[]>();
  for (const f of r.frames) {
    if (f.kind !== SAMPLE_KIND.EVENT || f.event === undefined) continue;
    byEvent.set(f.event, [...(byEvent.get(f.event) ?? []), f]);
  }
  const rows: SummaryRow[] = [];
  for (const hoop of HOOPS) {
    const rim = r.rims[hoop];
    if (!rim) continue;
    const quietFrames = r.frames.filter((f) => f.kind === SAMPLE_KIND.QUIET && f.hoop === hoop);
    for (const multiple of r.multiples) {
      const side = rimCrop(rim, multiple, r.video.width, r.video.height).side;
      for (const threshold of SUMMARY_THRESHOLDS) {
        const stats = (kind: LABEL_EVENT_KIND): EventStats => {
          const evs = r.events.filter((e) => e.hoop === hoop && e.kind === kind && byEvent.has(e.id));
          const hits = evs.map((e) => byEvent.get(e.id)!.filter((f) => hasBall(f, multiple, threshold)).length);
          const near = evs.map((e) => {
            const fs = byEvent.get(e.id)!.filter((f) => f.t <= e.t && f.t > e.t - NEAR_WINDOW);
            return fs.length ? fs.filter((f) => hasBall(f, multiple, threshold)).length / fs.length : 0;
          });
          return {
            n: evs.length,
            seen: mean(hits.map((h) => (h >= 1 ? 1 : 0))),
            seen3: mean(hits.map((h) => (h >= 3 ? 1 : 0))),
            nearFrames: mean(near),
          };
        };
        const widths = r.frames
          .filter((f) => f.kind === SAMPLE_KIND.EVENT && f.hoop === hoop)
          .flatMap((f) => (f.balls[multiple] ?? []).filter((b) => b.score >= threshold).slice(0, 1).map((b) => b.w));
        const ballPx = median(widths);
        rows.push({
          hoop, rimWidth: rim.width, multiple, threshold,
          makes: stats(LABEL_EVENT_KIND.MAKE),
          misses: stats(LABEL_EVENT_KIND.MISS),
          quiet: { n: quietFrames.length, rate: mean(quietFrames.map((f) => (hasBall(f, multiple, threshold) ? 1 : 0))) },
          ballPx,
          ballInputPx: (ballPx * r.inputSize) / side,
        });
      }
    }
  }
  return rows;
};
