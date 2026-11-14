import { describe, expect, it } from 'vitest';
import { DETECTOR_MODEL } from '../shared/detector';
import { HOOP, LABEL_EVENT_KIND } from '../shared/enums';
import { summarize } from './summary';
import { SAMPLE_KIND } from '../shared/enums';
import type { EvalResults, FrameResult } from '../shared/types';

const ball = (score: number, w = 20) => ({ x: 0, y: 0, w, h: w, score });

// One make at t=10 (frames 9.0..10.2 every 0.1 s), one miss at t=20 with no ball found, two quiet frames.
const results = (makeFrames: (t: number) => number | null): EvalResults => {
  const frames: FrameResult[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = +(9 + i / 10).toFixed(1);
    const s = makeFrames(t);
    frames.push({ kind: SAMPLE_KIND.EVENT, hoop: HOOP.LEFT, t, event: 0, balls: { 6: s === null ? [] : [ball(s)] } });
    frames.push({ kind: SAMPLE_KIND.EVENT, hoop: HOOP.LEFT, t: t + 10, event: 1, balls: { 6: [] } });
  }
  frames.push({ kind: SAMPLE_KIND.QUIET, hoop: HOOP.LEFT, t: 50, balls: { 6: [ball(0.6)] } });
  frames.push({ kind: SAMPLE_KIND.QUIET, hoop: HOOP.LEFT, t: 60, balls: { 6: [] } });
  return {
    version: 1, video: { name: 'c', size: 1, width: 3840, height: 2160 }, model: DETECTOR_MODEL.S, inputSize: 640,
    multiples: [6], minScore: 0.05, rims: { [HOOP.LEFT]: { x: 1000, y: 500, width: 40 } },
    events: [
      { id: 0, kind: LABEL_EVENT_KIND.MAKE, hoop: HOOP.LEFT, t: 10, points: 2 },
      { id: 1, kind: LABEL_EVENT_KIND.MISS, hoop: HOOP.LEFT, t: 20 },
    ],
    frames, startedAt: '', seconds: 0, complete: true,
  };
};

describe('summarize', () => {
  it('gives one row per basket, crop size and threshold', () => {
    const rows = summarize(results(() => null));
    expect(rows.map((r) => r.threshold)).toEqual([0.1, 0.25, 0.5]);
    expect(rows.every((r) => r.hoop === HOOP.LEFT && r.multiple === 6 && r.rimWidth === 40)).toBe(true);
  });

  it('counts a make as seen once the ball is found in enough frames', () => {
    // Ball found at 0.3 in the 5 frames from 9.6 to 10.0, which are the frames within 0.5 s before the label.
    const rows = summarize(results((t) => (t >= 9.6 && t <= 10 ? 0.3 : null)));
    const at = (th: number) => rows.find((r) => r.threshold === th)!;
    expect(at(0.25).makes).toEqual({ n: 1, seen: 1, seen3: 1, nearFrames: 1 });
    expect(at(0.5).makes).toEqual({ n: 1, seen: 0, seen3: 0, nearFrames: 0 });
    expect(at(0.25).misses).toEqual({ n: 1, seen: 0, seen3: 0, nearFrames: 0 });
  });

  it('reports quiet frames with a ball and the median ball size', () => {
    const row = summarize(results((t) => (t === 10 ? 0.9 : null))).find((r) => r.threshold === 0.25)!;
    expect(row.quiet).toEqual({ n: 2, rate: 0.5 });
    expect(row.makes.seen3).toBe(0);
    expect(row.ballPx).toBe(20);
    // A 240 px crop scaled to 640: 20 px becomes about 53 px.
    expect(row.ballInputPx).toBeCloseTo(53.3, 1);
  });
});
