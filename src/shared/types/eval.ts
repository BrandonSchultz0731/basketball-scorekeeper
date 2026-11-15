import type { HOOP, LABEL_EVENT_KIND, MISS_TYPE, SAMPLE_KIND } from '../enums';
import type { Rim } from './rim';

/** A labeled make or tricky miss that frames were sampled around. */
export interface EvalEvent {
  /** Position in `EvalResults.events`. */
  id: number;
  kind: LABEL_EVENT_KIND.MAKE | LABEL_EVENT_KIND.MISS;
  hoop: HOOP;
  t: number;
  points?: 2 | 3;
  missType?: MISS_TYPE;
}

/** One frame to run the detector on, around one rim. */
export interface Sample {
  kind: SAMPLE_KIND;
  hoop: HOOP;
  t: number;
  /** The event this frame belongs to, for event samples. */
  event?: number;
}

/** A ball the detector found, in video pixels. */
export interface BallBox {
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
}

export interface FrameResult extends Sample {
  /** Ball detections for each crop size, keyed by the crop multiple (rim widths), best first. */
  balls: Record<number, BallBox[]>;
}

/** What the eval page exports as `<clip>.eval.json`. */
export interface EvalResults {
  version: 1;
  video: { name: string; size: number; width: number; height: number };
  /** Detector model id, e.g. 'yolox_s'. */
  model: string;
  inputSize: number;
  /** Crop sizes tried, in rim widths. */
  multiples: number[];
  /** Lowest detector score kept. */
  minScore: number;
  rims: Partial<Record<HOOP, Rim>>;
  events: EvalEvent[];
  frames: FrameResult[];
  startedAt: string;
  /** Seconds the run took, and whether it was stopped before the end. */
  seconds: number;
  complete: boolean;
}
