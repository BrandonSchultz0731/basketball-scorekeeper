import { describe, expect, it } from 'vitest';
import { motionLevel } from './motion';

const gray = (v: number, n = 16) => {
  const f = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) f.set([v, v, v, 255], i * 4);
  return f;
};

describe('motion level', () => {
  it('is zero for identical frames', () => {
    expect(motionLevel(gray(100), gray(100))).toBe(0);
  });

  it('is the mean brightness change', () => {
    expect(motionLevel(gray(100), gray(130))).toBeCloseTo(30);
  });

  it('is zero for mismatched or empty frames', () => {
    expect(motionLevel(gray(100, 4), gray(100, 8))).toBe(0);
    expect(motionLevel(new Uint8ClampedArray(), new Uint8ClampedArray())).toBe(0);
  });
});
