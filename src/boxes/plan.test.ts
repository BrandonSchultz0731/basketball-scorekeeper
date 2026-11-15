import { describe, expect, it } from 'vitest';
import { HOOP, LABEL_EVENT_KIND, SAMPLE_KIND } from '../shared/enums';
import type { EvalResults, FrameResult } from '../shared/types';
import { QUIET_PER_HOOP, REVIEW_OFFSETS, bestBall, guessAt, planReview } from './plan';
import { GUESS_SOURCE } from './types';

const RIM = 40;
const ball = (x: number, score = 0.5, w = 20) => ({ x, y: 100, w, h: w, score });
const frame = (t: number, balls: ReturnType<typeof ball>[] = [], m = 6): FrameResult =>
  ({ kind: SAMPLE_KIND.EVENT, hoop: HOOP.LEFT, t, event: 0, balls: { [m]: balls } });

describe('bestBall', () => {
  it('takes the highest-scoring ball-sized box across crop sizes', () => {
    const f: FrameResult = { ...frame(1), balls: { 6: [ball(1, 0.4)], 10: [ball(2, 0.7)] } };
    expect(bestBall(f, RIM)?.x).toBe(2);
  });

  it('ignores boxes too small or too big to be a ball, and weak scores', () => {
    expect(bestBall(frame(1, [ball(1, 0.9, 6), ball(2, 0.9, 60), ball(3, 0.04)]), RIM)).toBeNull();
  });
});

describe('guessAt', () => {
  it('uses the detection in that frame', () => {
    expect(guessAt([frame(1, [ball(10)])], 1, RIM)).toMatchObject({ x: 10, source: GUESS_SOURCE.DETECTED });
  });

  it('follows the ball between nearby detections', () => {
    const g = guessAt([frame(1, [ball(10)]), frame(1.1), frame(1.2, [ball(30)])], 1.1, RIM);
    expect(g).toMatchObject({ x: 20, y: 100, source: GUESS_SOURCE.FOLLOWED });
  });

  it('gives no guess when the nearest detections are too far apart, or only on one side', () => {
    expect(guessAt([frame(1, [ball(10)]), frame(1.4), frame(1.8, [ball(30)])], 1.4, RIM)).toBeNull();
    expect(guessAt([frame(1, [ball(10)]), frame(1.1)], 1.1, RIM)).toBeNull();
  });
});

describe('planReview', () => {
  const results = (): EvalResults => {
    const frames: FrameResult[] = [];
    for (let i = 0; i <= 36; i++) frames.push(frame(+(9 + i / 30).toFixed(4), i === 30 ? [ball(500)] : []));
    for (let i = 0; i < 60; i++) frames.push({ kind: SAMPLE_KIND.QUIET, hoop: HOOP.LEFT, t: 20 + i, balls: { 6: [] } });
    return {
      version: 1, video: { name: 'c', size: 1, width: 3840, height: 2160 }, model: 'yolox_s', inputSize: 640,
      multiples: [6], minScore: 0.05, rims: { [HOOP.LEFT]: { x: 1000, y: 500, width: RIM } },
      events: [{ id: 0, kind: LABEL_EVENT_KIND.MAKE, hoop: HOOP.LEFT, t: 10, points: 3 }],
      frames, startedAt: '', seconds: 0, complete: true,
    };
  };

  it('picks the review offsets around each event, plus some quiet frames, in time order', () => {
    const plan = planReview(results());
    const ev = plan.filter((p) => p.event);
    expect(ev.map((p) => +(p.t - 10).toFixed(2))).toEqual(REVIEW_OFFSETS);
    expect(plan.filter((p) => !p.event)).toHaveLength(QUIET_PER_HOOP);
    expect(plan.map((p) => p.t)).toEqual([...plan.map((p) => p.t)].sort((a, b) => a - b));
  });

  it('saves a region 10 rim widths across and carries the guess', () => {
    const atLabel = planReview(results()).find((p) => p.id === 'e000-5')!;
    expect(atLabel.region).toEqual({ x: 800, y: 320, side: 400 });
    expect(atLabel.guess).toMatchObject({ x: 500, source: GUESS_SOURCE.DETECTED });
    expect(atLabel.event).toEqual({ kind: LABEL_EVENT_KIND.MAKE, t: 10, points: 3 });
  });
});
