import type { COCO_CLASS } from '../enums';

/** One detector output box. */
export interface Detection {
  /** Box in input-tensor pixels (0..size). */
  x: number; y: number; w: number; h: number;
  score: number;
  cls: COCO_CLASS;
}
