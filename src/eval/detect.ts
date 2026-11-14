// Browser-side plumbing for the eval run: the detector worker as a promise API.
import {
  BACKEND, DETECTOR_MODEL, MODELS, WORKER_MESSAGE_TYPE, createDetectorWorker, type WorkerIn, type WorkerOut,
} from '../shared/detector';
import type { Detection } from '../shared/types';

export interface Detector {
  run: (bitmap: ImageBitmap, threshold: number) => Promise<Detection[]>;
  stop: () => void;
}

/** Starts a worker, loads the model and resolves once it's warmed up. */
export const startDetector = (model: DETECTOR_MODEL, backend: BACKEND): Promise<Detector> => new Promise((resolve, reject) => {
  const w = createDetectorWorker();
  const pending = new Map<number, { ok: (d: Detection[]) => void; fail: (e: Error) => void }>();
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
      pending.get(m.id)?.ok(m.dets);
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
