// Browser-only helpers for working with a <video> element frame by frame.

/** Seeks and resolves once the frame at `t` can be drawn. */
export const seekTo = (v: HTMLVideoElement, t: number): Promise<void> => new Promise((resolve) => {
  if (Math.abs(v.currentTime - t) < 1e-4 && v.readyState >= 2) { resolve(); return; }
  v.addEventListener('seeked', () => resolve(), { once: true });
  v.currentTime = t;
});
