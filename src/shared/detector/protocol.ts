// Messages between a page and detector.worker.ts. Kept separate from the worker so the
// page can import these enums without pulling onnxruntime into the main bundle.
import type { COCO_CLASS } from '../enums';
import type { Detection } from '../types';
import type { DETECTOR_MODEL } from './models';

export enum BACKEND {
  WEBGPU = 'webgpu',
  WASM = 'wasm',
}

export enum WORKER_MESSAGE_TYPE {
  INIT = 'init',
  RUN = 'run',
  READY = 'ready',
  RESULT = 'result',
  ERROR = 'error',
}

export type WorkerIn =
  | {
    type: WORKER_MESSAGE_TYPE.INIT; model: DETECTOR_MODEL; backend: BACKEND; modelUrl: string; size: number;
    /** What each output class is, for models that aren't the 80 COCO classes. */
    classes?: COCO_CLASS[];
  }
  | { type: WORKER_MESSAGE_TYPE.RUN; id: number; bitmap: ImageBitmap; threshold: number };

export type WorkerOut =
  | { type: WORKER_MESSAGE_TYPE.READY; model: DETECTOR_MODEL; size: number; backend: BACKEND; loadMs: number; warmupMs: number; info: string }
  | { type: WORKER_MESSAGE_TYPE.RESULT; id: number; prepMs: number; inferMs: number; postMs: number; dets: Detection[] }
  | { type: WORKER_MESSAGE_TYPE.ERROR; message: string };

export enum MAKE_CHECK_MESSAGE_TYPE {
  INIT = 'init',
  RUN = 'run',
  READY = 'ready',
  RESULT = 'result',
  ERROR = 'error',
}

/** Messages to and from makeCheck.worker.ts, which runs the make/miss model on clips around a call. */
export type MakeCheckIn =
  | { type: MAKE_CHECK_MESSAGE_TYPE.INIT; modelUrl: string }
  /** `input` is from makeClipInput: [frames * 3, crop, crop]. */
  | { type: MAKE_CHECK_MESSAGE_TYPE.RUN; id: number; input: Float32Array };

export type MakeCheckOut =
  | { type: MAKE_CHECK_MESSAGE_TYPE.READY; loadMs: number }
  /** `p`: how sure the model is that the ball went in, 0 to 1. */
  | { type: MAKE_CHECK_MESSAGE_TYPE.RESULT; id: number; p: number; ms: number }
  | { type: MAKE_CHECK_MESSAGE_TYPE.ERROR; message: string };
