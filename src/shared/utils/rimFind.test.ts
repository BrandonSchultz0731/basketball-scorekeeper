import { describe, expect, it } from 'vitest';
import type { GrayImage, Rim } from '../types';
import { bestMatch, findRim, rimReference, sampleGray } from './rimFind';

const W = 640, H = 360;

/** A scene with a textured background and a "hoop" (backboard square, rim bar, net stripes) at `rim`. */
const scene = (rim: Rim): GrayImage => {
  const data = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 90 + 30 * Math.sin(x / 23) * Math.cos(y / 31) + 10 * Math.sin((x + 2 * y) / 7);
      const u = (x - rim.x) / rim.width, w = (y - rim.y) / rim.width;
      if (Math.abs(u) < 1.2 && w > -1.4 && w < -0.1) v = Math.abs(u) > 1 || w < -1.2 ? 30 : 220;  // backboard
      if (Math.abs(u) < 0.25 && w > -0.6 && w < -0.2) v = 40;  // the square on the backboard
      if (Math.abs(u) <= 0.5 && w >= 0 && w < 0.08) v = 200;  // rim
      if (Math.abs(u) < 0.5 - 0.1 * w && w >= 0.08 && w < 1) v = Math.floor(u * 8) % 2 ? 245 : 120;  // net
      data[y * W + x] = v;
    }
  }
  return { width: W, height: H, data };
};
const sampler = (img: GrayImage) => (r: Parameters<typeof sampleGray>[1], w: number, h: number) => sampleGray(img, r, w, h);

describe('sampleGray', () => {
  it('averages the pixels under each output pixel', () => {
    const img: GrayImage = { width: 4, height: 2, data: Float32Array.from([0, 2, 4, 6, 2, 4, 6, 8]) };
    expect(Array.from(sampleGray(img, { x: 0, y: 0, w: 4, h: 2 }, 2, 1).data)).toEqual([2, 6]);
  });
  it('repeats the edge pixel past the frame', () => {
    const img: GrayImage = { width: 2, height: 1, data: Float32Array.from([10, 20]) };
    expect(Array.from(sampleGray(img, { x: -2, y: 0, w: 4, h: 1 }, 4, 1).data)).toEqual([10, 10, 10, 20]);
  });
});

describe('bestMatch', () => {
  it('finds a patch cut from the image, with a perfect score', () => {
    const img = sampleGray(scene({ x: 300, y: 150, width: 40 }), { x: 0, y: 0, w: W, h: H }, 160, 90);
    const tw = 20, th = 15, data = new Float32Array(tw * th);
    for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) data[j * tw + i] = img.data[(30 + j) * 160 + 70 + i];
    const m = bestMatch(img, { width: tw, height: th, data });
    expect([m.x, m.y]).toEqual([70, 30]);
    expect(m.score).toBeCloseTo(1, 5);
  });
});

describe('findRim', () => {
  const rim: Rim = { x: 300, y: 150, width: 40, netBottom: 190 };
  const ref = rimReference(sampler(scene(rim)), rim, { width: W, height: H });

  it('finds a rim that moved and grew', () => {
    const now: Rim = { x: 345, y: 128, width: 46, netBottom: 174 };
    const m = findRim(sampler(scene(now)), ref, { width: W, height: H });
    expect(m.found).toBe(true);
    expect(Math.abs(m.rim.x - now.x)).toBeLessThan(3);
    expect(Math.abs(m.rim.y - now.y)).toBeLessThan(3);
    expect(m.rim.width / now.width).toBeCloseTo(1, 1);
    expect(m.rim.netBottom! - m.rim.y).toBeCloseTo((now.netBottom! - now.y), -1);
  });

  it('scales a rim saved at another frame size', () => {
    const m = findRim(sampler(scene(rim)), { ...ref, frameWidth: 2 * W, frameHeight: 2 * H, rim: { x: 600, y: 300, width: 80, netBottom: 380 } }, { width: W, height: H });
    expect(m.found).toBe(true);
    expect(Math.abs(m.rim.x - rim.x)).toBeLessThan(3);
  });

  it("doesn't trust a match when the rim isn't there", () => {
    const empty = scene({ x: -1000, y: -1000, width: 40 });
    expect(findRim(sampler(empty), ref, { width: W, height: H }).found).toBe(false);
  });
});
