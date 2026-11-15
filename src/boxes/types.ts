import type { HOOP, LABEL_EVENT_KIND, MISS_TYPE } from '../shared/enums';
import type { BallBox, Crop, Rim } from '../shared/types';

/** Where a frame's first guess at the ball came from. */
export enum GUESS_SOURCE {
  /** The stock detector found a ball-sized ball here. */
  DETECTED = 'detected',
  /** Filled in between nearby frames where the detector found it. */
  FOLLOWED = 'followed',
  NONE = 'none',
}

/** What the reviewer said about a frame. */
export enum ANSWER {
  BALL = 'ball',
  NO_BALL = 'no_ball',
  /** Left out of training, e.g. a frame with a background ball the reviewer chose not to box. */
  EXCLUDE = 'exclude',
}

/** A ball box in video pixels. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One frame to review: a square around one rim at one moment. */
export interface ReviewFrame {
  /** Stable id, also the image file name. */
  id: string;
  hoop: HOOP;
  t: number;
  /** The make or tricky miss this frame is around, or undefined for a quiet frame. */
  event?: { kind: LABEL_EVENT_KIND.MAKE | LABEL_EVENT_KIND.MISS; t: number; points?: 2 | 3; missType?: MISS_TYPE };
  /** The area saved as the training image, in video pixels. */
  region: Crop;
  guess: (BallBox & { source: GUESS_SOURCE }) | null;
  /** Every visible ball is boxed, not just the one being shot. */
  answer?: { answer: ANSWER; boxes?: Box[] };
}

/** What the review page saves as `<clip>.boxes.json`, next to `dataset/<clip>/<frame id>.jpg`. */
export interface BoxesFile {
  version: 1;
  video: { name: string; size: number; width: number; height: number };
  rims: Partial<Record<HOOP, Rim>>;
  /** Region size in rim widths. Training crops are cut from inside it. */
  regionMultiple: number;
  frames: ReviewFrame[];
}
