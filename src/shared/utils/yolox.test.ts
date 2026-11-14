import { describe, expect, it } from 'vitest';
import { COCO_CLASS } from '../enums';
import { decodeWanted } from './yolox';

// A 64 px input has 8x8 + 4x4 + 2x2 = 84 anchors. Put one confident box on the first stride-8 anchor.
const raw = (numClasses: number, cls: number): Float32Array => {
  const stride = 5 + numClasses;
  const r = new Float32Array(84 * stride);
  r[0] = 0.5; r[1] = 0.5; // center offset within the cell
  r[4] = 0.9; // objectness
  r[5 + cls] = 0.9;
  return r;
};

describe('decodeWanted', () => {
  it('keeps the wanted COCO classes from an 80-class model', () => {
    expect(decodeWanted(raw(80, COCO_CLASS.SPORTS_BALL), 64, 80, [COCO_CLASS.SPORTS_BALL], 0.5).map((d) => d.cls))
      .toEqual([COCO_CLASS.SPORTS_BALL]);
    expect(decodeWanted(raw(80, 5), 64, 80, [COCO_CLASS.SPORTS_BALL], 0.5)).toEqual([]);
  });

  it('labels a one-class ball model\'s detections as sports balls', () => {
    const dets = decodeWanted(raw(1, 0), 64, 1, [COCO_CLASS.PERSON, COCO_CLASS.SPORTS_BALL], 0.5, [COCO_CLASS.SPORTS_BALL]);
    expect(dets).toHaveLength(1);
    expect(dets[0]).toMatchObject({ cls: COCO_CLASS.SPORTS_BALL, x: 4 - 4, y: 0, w: 8, h: 8 });
    expect(dets[0].score).toBeCloseTo(0.81);
  });

  it('drops classes that are not wanted', () => {
    expect(decodeWanted(raw(1, 0), 64, 1, [COCO_CLASS.PERSON], 0.5, [COCO_CLASS.SPORTS_BALL])).toEqual([]);
  });
});
