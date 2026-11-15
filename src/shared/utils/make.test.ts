import { describe, expect, it } from 'vitest';
import { HOOP } from '../enums';
import type { BallBox, Rim } from '../types';
import { DEFAULT_MAKE_SETTINGS, createMakeDetector, detectMakes, madeFrom } from './make';

// A rim 100 px wide, top at y=500, net down to y=600.
const RIM: Rim = { x: 1000, y: 500, width: 100, netBottom: 600 };
const FPS = 30;
const ball = (x: number, y: number, score = 0.9, size = 50): BallBox => ({ x: x - size / 2, y: y - size / 2, w: size, h: size, score });

/** Frames of a ball moving in a straight line from (x0, y0) to (x1, y1), one box per frame. */
const path = (x0: number, y0: number, x1: number, y1: number, frames: number): BallBox[][] =>
  Array.from({ length: frames }, (_, i) => [ball(x0 + ((x1 - x0) * i) / (frames - 1), y0 + ((y1 - y0) * i) / (frames - 1))]);
const empty = (n: number): BallBox[][] => Array.from({ length: n }, () => []);

describe('make logic', () => {
  it('calls a ball that drops through the rim into the net', () => {
    const calls = detectMakes(HOOP.LEFT, RIM, [...empty(5), ...path(1000, 350, 1000, 580, 10), ...empty(5)], FPS);
    expect(calls).toHaveLength(1);
    expect(calls[0].hoop).toBe(HOOP.LEFT);
  });

  it('calls a make when the ball is lost for a few frames inside the net', () => {
    const frames = [...path(1000, 350, 1000, 500, 6), ...empty(4), ...path(1000, 570, 1000, 600, 3)];
    expect(detectMakes(HOOP.LEFT, RIM, frames, FPS)).toHaveLength(1);
  });

  it('does not call a ball that drops past the side of the rim', () => {
    expect(detectMakes(HOOP.LEFT, RIM, path(1150, 350, 1150, 650, 12), FPS)).toHaveLength(0);
  });

  it('does not call a ball that rises up through the net area', () => {
    expect(detectMakes(HOOP.LEFT, RIM, path(1000, 650, 1000, 350, 12), FPS)).toHaveLength(0);
  });

  it('ignores detections that are not ball-sized', () => {
    const head = path(1000, 350, 1000, 580, 10).map((f) => f.map((b) => ({ ...b, w: 150, h: 150, x: b.x - 50, y: b.y - 50 })));
    expect(detectMakes(HOOP.LEFT, RIM, head, FPS)).toHaveLength(0);
  });

  it('ignores low scores', () => {
    const faint = path(1000, 350, 1000, 580, 10).map((f) => f.map((b) => ({ ...b, score: 0.1 })));
    expect(detectMakes(HOOP.LEFT, RIM, faint, FPS)).toHaveLength(0);
  });

  it('calls one make per shot, even if two tracks end in the net', () => {
    const frames = path(1000, 350, 1000, 580, 10).map((f) => [...f, ball(1010, f[0].y + 5, 0.5)]);
    expect(detectMakes(HOOP.LEFT, RIM, frames, FPS)).toHaveLength(1);
  });

  it('calls two makes that are a few seconds apart', () => {
    const shot = path(1000, 350, 1000, 580, 10);
    expect(detectMakes(HOOP.LEFT, RIM, [...shot, ...empty(90), ...shot], FPS)).toHaveLength(2);
  });

  it('ignores something that sits still in the net area for seconds', () => {
    // A still "ball" in the net (say, a fixture behind it) for 3 s, then flickering above the rim.
    const det = createMakeDetector(HOOP.LEFT, RIM);
    for (let i = 0; i < 90; i++) det.push(i / FPS, [ball(1000, 560)]);
    expect(det.push(91 / FPS, [ball(1000, 450)])).toBeNull();
    expect(det.push(92 / FPS, [ball(1000, 560)])).toBeNull();
  });

  it('reports when a moving ball was last seen, but not a ball sitting still', () => {
    const det = createMakeDetector(HOOP.LEFT, RIM);
    for (let i = 0; i < 90; i++) det.push(i / FPS, [ball(800, 700)]);
    expect(det.lastMovingBall()).toBeLessThan(2.1);
    det.push(91 / FPS, [ball(1000, 300)]);
    expect(det.lastMovingBall()).toBeCloseTo(91 / FPS);
  });

  it('works out when the ball was last above the rim', () => {
    const pts = [400, 450, 490, 520, 560].map((y, i) => ({ t: i / FPS, x: 1000, y, size: 50, score: 0.9 }));
    expect(madeFrom(pts, RIM, DEFAULT_MAKE_SETTINGS)).toBeCloseTo(2 / FPS);
  });
});
