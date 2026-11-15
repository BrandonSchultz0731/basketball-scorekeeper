import { describe, expect, it } from 'vitest';
import { COCO_CLASS } from '../enums';
import { rimCrop, toVideoBox } from './crop';

describe('rimCrop', () => {
  it('centers the crop half a rim below the top of the rim', () => {
    expect(rimCrop({ x: 1000, y: 500, width: 40 }, 6, 3840, 2160)).toEqual({ x: 880, y: 400, side: 240 });
  });

  it('keeps the crop inside the frame', () => {
    expect(rimCrop({ x: 50, y: 30, width: 100 }, 6, 3840, 2160)).toEqual({ x: 0, y: 0, side: 600 });
    expect(rimCrop({ x: 3800, y: 2150, width: 100 }, 6, 3840, 2160)).toEqual({ x: 3240, y: 1560, side: 600 });
  });

  it('never makes the crop bigger than the frame', () => {
    expect(rimCrop({ x: 960, y: 540, width: 400 }, 10, 1920, 1080).side).toBe(1080);
  });
});

describe('toVideoBox', () => {
  it('scales and offsets a box from input pixels to video pixels', () => {
    const d = { x: 320, y: 160, w: 64, h: 64, score: 0.9, cls: COCO_CLASS.SPORTS_BALL };
    expect(toVideoBox(d, { x: 100, y: 200, side: 320 }, 640)).toEqual({ ...d, x: 260, y: 280, w: 32, h: 32 });
  });
});
