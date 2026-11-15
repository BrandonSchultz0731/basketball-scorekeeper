/// <reference lib="webworker" />
// Runs the make/miss model (training/train_make.py). It's small, so it runs on the CPU (wasm) and leaves the GPU to
// the ball detector.
import * as ort from 'onnxruntime-web/wasm';
import { MAKE_CLIP } from '../utils';
import { MAKE_CHECK_MESSAGE_TYPE, type MakeCheckIn, type MakeCheckOut } from './protocol';

let session: ort.InferenceSession | null = null;
const post = (m: MakeCheckOut) => (self as DedicatedWorkerGlobalScope).postMessage(m);
const dims = [1, MAKE_CLIP.count * 3, MAKE_CLIP.crop, MAKE_CLIP.crop];

self.onmessage = async (e: MessageEvent<MakeCheckIn>) => {
  const msg = e.data;
  try {
    if (msg.type === MAKE_CHECK_MESSAGE_TYPE.INIT) {
      ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(2, navigator.hardwareConcurrency) : 1;
      const t0 = performance.now();
      session?.release();
      session = await ort.InferenceSession.create(msg.modelUrl, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', new Float32Array(dims.reduce((a, b) => a * b)), dims) });
      post({ type: MAKE_CHECK_MESSAGE_TYPE.READY, loadMs: performance.now() - t0 });
    } else if (msg.type === MAKE_CHECK_MESSAGE_TYPE.RUN) {
      if (!session) throw new Error('not initialised');
      const t0 = performance.now();
      const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', msg.input, dims) });
      const logit = (out[session.outputNames[0]].data as Float32Array)[0];
      post({ type: MAKE_CHECK_MESSAGE_TYPE.RESULT, id: msg.id, p: 1 / (1 + Math.exp(-logit)), ms: performance.now() - t0 });
    }
  } catch (err) {
    post({ type: MAKE_CHECK_MESSAGE_TYPE.ERROR, message: err instanceof Error ? err.message : String(err) });
  }
};
