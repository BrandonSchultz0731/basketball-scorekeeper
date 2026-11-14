// The YOLOX detector, run in a web worker. Used by the spike page and the eval page, and later by the scoreboard.
// The worker file itself is not re-exported: importing it would pull onnxruntime into the page bundle.
export * from './models';
export * from './protocol';

/** Starts a detector worker. Send it an INIT message, wait for READY, then send RUN messages. */
export const createDetectorWorker = (): Worker =>
  new Worker(new URL('./detector.worker.ts', import.meta.url), { type: 'module' });
