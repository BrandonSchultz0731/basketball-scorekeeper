import { describe, expect, it } from 'vitest';
import { MAKE_CLIP, MAKE_CLIP_AFTER, clipFrameTimes, makeClipInput, rimSquare } from './makeClip';

describe('make clip', () => {
  it('takes the square around the rim the way training did', () => {
    // 2.5 rim widths across, centered 0.6 rim widths below the rim top.
    expect(rimSquare({ x: 1000, y: 500, width: 100 }, 3840, 2160)).toEqual({ x: 875, y: 435, side: 250 });
  });

  it('keeps the square inside the frame', () => {
    expect(rimSquare({ x: 20, y: 10, width: 100 }, 3840, 2160)).toEqual({ x: 0, y: 0, side: 250 });
  });

  it('uses frames from just before the call to about 0.63 s after', () => {
    const ts = clipFrameTimes(10);
    expect(ts).toHaveLength(MAKE_CLIP.count);
    expect(ts[0]).toBeCloseTo(10 - 8 / 30);
    expect(ts[9]).toBeCloseTo(10 + 19 / 30);
    expect(MAKE_CLIP_AFTER).toBeCloseTo(19 / 30);
  });

  it('builds BGR channels from the center crop of each frame, scaled to -0.5..0.5', () => {
    const { size, crop, count } = MAKE_CLIP;
    const frames = Array.from({ length: count }, (_, k) => {
      const f = new Uint8ClampedArray(size * size * 4);
      for (let i = 0; i < size * size; i++) { f[i * 4] = 255; f[i * 4 + 1] = k; f[i * 4 + 2] = 0; f[i * 4 + 3] = 255; }
      return f;
    });
    const out = makeClipInput(frames);
    const n = crop * crop;
    expect(out).toHaveLength(count * 3 * n);
    expect(out[0]).toBeCloseTo(-0.5);              // frame 0, blue
    expect(out[n]).toBeCloseTo(0 / 255 - 0.5);      // frame 0, green
    expect(out[2 * n]).toBeCloseTo(0.5);            // frame 0, red
    expect(out[(3 * 4 + 1) * n]).toBeCloseTo(4 / 255 - 0.5); // frame 4, green
  });

  it('refuses the wrong number of frames', () => {
    expect(() => makeClipInput([])).toThrow();
  });
});
