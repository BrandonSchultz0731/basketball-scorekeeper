// The detector and make/miss workers as promise APIs.
import type { Detection } from '../types';
import { DETECTOR_MODEL, MAKE_CHECK_MODEL, MODELS } from './models';
import {
  BACKEND, MAKE_CHECK_MESSAGE_TYPE, WORKER_MESSAGE_TYPE, type MakeCheckIn, type MakeCheckOut, type WorkerIn, type WorkerOut,
} from './protocol';
import { createDetectorWorker, createMakeCheckWorker } from './workers';

/** One check's detections, and where its time went in the worker, ms. */
export interface DetectorResult {
  dets: Detection[];
  /** Reading the pixels and converting them for the model. */
  prepMs: number;
  /** Waiting for the model to finish the check before this one (two can be in flight). */
  queueMs: number;
  /** The model itself. */
  inferMs: number;
  /** Decoding the boxes. */
  postMs: number;
}

export interface Detector {
  run: (bitmap: ImageBitmap, threshold: number) => Promise<DetectorResult>;
  stop: () => void;
}

/** Starts a worker, loads the model and resolves once it's warmed up. */
export const startDetector = (model: DETECTOR_MODEL, backend: BACKEND): Promise<Detector> => new Promise((resolve, reject) => {
  const w = createDetectorWorker();
  const pending = new Map<number, { ok: (r: DetectorResult) => void; fail: (e: Error) => void }>();
  let nextId = 0;
  let ready = false;
  w.onmessage = (e: MessageEvent<WorkerOut>) => {
    const m = e.data;
    if (m.type === WORKER_MESSAGE_TYPE.READY) {
      ready = true;
      resolve({
        run: (bitmap, threshold) => new Promise((ok, fail) => {
          const id = nextId++;
          pending.set(id, { ok, fail });
          w.postMessage({ type: WORKER_MESSAGE_TYPE.RUN, id, bitmap, threshold } satisfies WorkerIn, [bitmap]);
        }),
        stop: () => w.terminate(),
      });
    } else if (m.type === WORKER_MESSAGE_TYPE.RESULT) {
      pending.get(m.id)?.ok({ dets: m.dets, prepMs: m.prepMs, queueMs: m.queueMs, inferMs: m.inferMs, postMs: m.postMs });
      pending.delete(m.id);
    } else if (m.type === WORKER_MESSAGE_TYPE.ERROR) {
      const err = new Error(`detector: ${m.message}`);
      if (!ready) { w.terminate(); reject(err); }
      pending.forEach((p) => p.fail(err));
      pending.clear();
    }
  };
  w.postMessage({
    type: WORKER_MESSAGE_TYPE.INIT, model, backend, size: MODELS[model].size, classes: MODELS[model].classes,
    modelUrl: new URL(`${import.meta.env.BASE_URL}models/${MODELS[model].file}`, location.origin).href,
  } satisfies WorkerIn);
});

export interface MakeCheck {
  /** How sure the model is that the ball went in, 0 to 1. `input` is from makeClipInput. */
  run: (input: Float32Array) => Promise<number>;
  stop: () => void;
}

/** Starts the make/miss worker and resolves once the model is loaded. */
export const startMakeCheck = (): Promise<MakeCheck> => new Promise((resolve, reject) => {
  const w = createMakeCheckWorker();
  const pending = new Map<number, { ok: (p: number) => void; fail: (e: Error) => void }>();
  let nextId = 0;
  let ready = false;
  w.onmessage = (e: MessageEvent<MakeCheckOut>) => {
    const m = e.data;
    if (m.type === MAKE_CHECK_MESSAGE_TYPE.READY) {
      ready = true;
      resolve({
        run: (input) => new Promise((ok, fail) => {
          const id = nextId++;
          pending.set(id, { ok, fail });
          w.postMessage({ type: MAKE_CHECK_MESSAGE_TYPE.RUN, id, input } satisfies MakeCheckIn, [input.buffer]);
        }),
        stop: () => w.terminate(),
      });
    } else if (m.type === MAKE_CHECK_MESSAGE_TYPE.RESULT) {
      pending.get(m.id)?.ok(m.p);
      pending.delete(m.id);
    } else {
      const err = new Error(`make check: ${m.message}`);
      if (!ready) { w.terminate(); reject(err); }
      pending.forEach((p) => p.fail(err));
      pending.clear();
    }
  };
  w.postMessage({
    type: MAKE_CHECK_MESSAGE_TYPE.INIT,
    modelUrl: new URL(`${import.meta.env.BASE_URL}models/${MAKE_CHECK_MODEL.file}`, location.origin).href,
  } satisfies MakeCheckIn);
});
