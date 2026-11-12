/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web/webgpu';
import { COCO_CLASS } from '../shared/enums';
import { decode, toTensorData } from '../shared/utils';
import { WORKER_MESSAGE_TYPE, type WorkerIn, type WorkerOut } from './protocol';

let session: ort.InferenceSession | null = null;
let size = 416;
let ctx: OffscreenCanvasRenderingContext2D | null = null;

const post = (m: WorkerOut) => (self as DedicatedWorkerGlobalScope).postMessage(m);

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;
  try {
    if (msg.type === WORKER_MESSAGE_TYPE.INIT) {
      size = msg.size;
      // Threads need cross-origin isolation, which static hosts like GitHub Pages don't give.
      ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency) : 1;
      const t0 = performance.now();
      session?.release();
      session = await ort.InferenceSession.create(msg.modelUrl, {
        executionProviders: [msg.backend],
        graphOptimizationLevel: 'all',
      });
      const loadMs = performance.now() - t0;
      const t1 = performance.now();
      const dummy = new ort.Tensor('float32', new Float32Array(3 * size * size), [1, 3, size, size]);
      await session.run({ [session.inputNames[0]]: dummy });
      const warmupMs = performance.now() - t1;
      ctx = new OffscreenCanvas(size, size).getContext('2d', { willReadFrequently: true });
      post({
        type: WORKER_MESSAGE_TYPE.READY, model: msg.model, size, backend: msg.backend, loadMs, warmupMs,
        info: `threads=${ort.env.wasm.numThreads} crossOriginIsolated=${self.crossOriginIsolated} webgpu=${'gpu' in navigator}`,
      });
    } else if (msg.type === WORKER_MESSAGE_TYPE.RUN) {
      if (!session || !ctx) throw new Error('not initialised');
      const t0 = performance.now();
      ctx.drawImage(msg.bitmap, 0, 0, size, size);
      msg.bitmap.close();
      const px = ctx.getImageData(0, 0, size, size).data;
      const input = new ort.Tensor('float32', toTensorData(px, size), [1, 3, size, size]);
      const t1 = performance.now();
      const out = await session.run({ [session.inputNames[0]]: input });
      const t2 = performance.now();
      const raw = out[session.outputNames[0]];
      const numClasses = (raw.dims[2] as number) - 5;
      const dets = decode(raw.data as Float32Array, size, numClasses, [COCO_CLASS.PERSON, COCO_CLASS.SPORTS_BALL], msg.threshold);
      raw.dispose();
      post({ type: WORKER_MESSAGE_TYPE.RESULT, id: msg.id, prepMs: t1 - t0, inferMs: t2 - t1, postMs: performance.now() - t2, dets });
    }
  } catch (err) {
    post({ type: WORKER_MESSAGE_TYPE.ERROR, message: err instanceof Error ? err.message : String(err) });
  }
};
