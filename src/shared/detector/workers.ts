// Worker constructors. The worker files themselves aren't imported: that would pull onnxruntime into the page bundle.

/** Starts a detector worker. Send it an INIT message, wait for READY, then send RUN messages. */
export const createDetectorWorker = (): Worker =>
  new Worker(new URL('./detector.worker.ts', import.meta.url), { type: 'module' });

/** Starts a make/miss worker. Send it an INIT message, wait for READY, then send RUN messages. */
export const createMakeCheckWorker = (): Worker =>
  new Worker(new URL('./makeCheck.worker.ts', import.meta.url), { type: 'module' });
