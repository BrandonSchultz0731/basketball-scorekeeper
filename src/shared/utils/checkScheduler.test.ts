import { describe, expect, it } from 'vitest';
import { HOOP } from '../enums';
import type { BallBox, Rim } from '../types';
import { DEFAULT_CHECK_SCHEDULER, createCheckScheduler, simulatePhone } from './checkScheduler';

const BOTH = [HOOP.LEFT, HOOP.RIGHT] as const;

describe('check scheduler', () => {
  it('gives every rim its minimum share, even when quiet', () => {
    const s = createCheckScheduler(BOTH);
    const first = s.next(0)!;
    s.ran(first, 0);
    expect(s.next(0.01)).not.toBe(first);
  });

  it('rests when everything is quiet and every rim has had its share', () => {
    const s = createCheckScheduler(BOTH);
    s.ran(HOOP.LEFT, 0); s.ran(HOOP.RIGHT, 0);
    expect(s.next(0.05)).toBeNull();
  });

  it('checks a busy rim between the minimum checks', () => {
    const s = createCheckScheduler(BOTH);
    s.ran(HOOP.LEFT, 0); s.ran(HOOP.RIGHT, 0);
    s.motion(HOOP.RIGHT, 0.02, DEFAULT_CHECK_SCHEDULER.motionLevel + 1);
    expect(s.next(0.05)).toBe(HOOP.RIGHT);
  });

  it('prefers a rim with a moving ball over a busy one', () => {
    const s = createCheckScheduler(BOTH);
    s.ran(HOOP.LEFT, 0); s.ran(HOOP.RIGHT, 0);
    s.motion(HOOP.RIGHT, 0.02, 10);
    s.ball(HOOP.LEFT, 0.03);
    expect(s.next(0.05)).toBe(HOOP.LEFT);
  });
});

describe('phone simulation', () => {
  const RIM: Rim = { x: 1000, y: 500, width: 100, netBottom: 600 };
  const FPS = 30;
  const ball = (x: number, y: number): BallBox => ({ x: x - 25, y: y - 25, w: 50, h: 50, score: 0.9 });
  // 2 s quiet, then a ball comes down through the rim over 0.4 s, then quiet.
  const frames: BallBox[][] = Array.from({ length: 120 }, (_, i) => {
    const k = i - 60;
    return k >= 0 && k < 12 ? [ball(1000, 350 + k * 22)] : [];
  });
  const motion: [number, number][] = Array.from({ length: 30 }, (_, j) => [j * 4, j * 4 >= 52 && j * 4 < 76 ? 5 : 0.2]);

  it('calls the make when the phone can check often enough', () => {
    expect(simulatePhone({ [HOOP.LEFT]: { rim: RIM, frames, motion } }, FPS, 15)).toHaveLength(1);
  });

  it('can miss it when checks are too rare', () => {
    expect(simulatePhone({ [HOOP.LEFT]: { rim: RIM, frames, motion } }, FPS, 2)).toHaveLength(0);
  });
});
