// Browser-only helpers for video: stepping through a <video> frame by frame, and opening the back camera.
import type { GraySampler } from '../utils';

/** Seeks and resolves once the frame at `t` can be drawn. */
export const seekTo = (v: HTMLVideoElement, t: number): Promise<void> => new Promise((resolve) => {
  if (Math.abs(v.currentTime - t) < 1e-4 && v.readyState >= 2) { resolve(); return; }
  v.addEventListener('seeked', () => resolve(), { once: true });
  v.currentTime = t;
});

/** Best back camera by label: ultra-wide first, then any back/rear camera. iOS labels look like "Back Ultra Wide Camera". */
export const pickBackCamera = (cams: MediaDeviceInfo[]): MediaDeviceInfo | undefined => {
  const back = cams.filter((d) => /back|rear|environment/i.test(d.label));
  return back.find((d) => /ultra/i.test(d.label)) ?? back[0];
};

/**
 * Opens the back camera at 4K and 30 fps, preferring the ultra-wide. Device labels only appear after permission, so
 * it opens any back camera first, then switches to the ultra-wide if that's a different one.
 */
export const openBackCamera = async (): Promise<MediaStream> => {
  const request = (camera: MediaTrackConstraints) => navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { ...camera, width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 30 } },
  });
  let stream: MediaStream;
  try {
    stream = await request({ facingMode: { exact: 'environment' } });
  } catch (err) {
    if (!(err instanceof DOMException && err.name === 'OverconstrainedError')) throw err;
    stream = await request({});
  }
  const preferred = pickBackCamera(await navigator.mediaDevices.enumerateDevices());
  if (preferred && preferred.deviceId !== stream.getVideoTracks()[0].getSettings().deviceId) {
    stream.getTracks().forEach((t) => t.stop());
    stream = await request({ deviceId: { exact: preferred.deviceId } });
  }
  return stream;
};

/**
 * Reads areas of a video's current frame as grayscale, for finding rims (findRim in src/shared/utils/rimFind.ts).
 * Each area is scaled down by the GPU while drawing. Parts outside the frame read as mid-gray: they are clipped by
 * hand, since Safari has drawn nothing at all for a source rectangle that reaches past the video.
 */
export const videoGraySampler = (video: HTMLVideoElement): GraySampler => {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
  return (r, w, h) => {
    ctx.canvas.width = w;
    ctx.canvas.height = h;
    ctx.fillStyle = 'rgb(128 128 128)';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y);
    const x1 = Math.min(video.videoWidth, r.x + r.w), y1 = Math.min(video.videoHeight, r.y + r.h);
    if (x1 > x0 && y1 > y0) {
      const kx = w / r.w, ky = h / r.h;
      ctx.drawImage(video, x0, y0, x1 - x0, y1 - y0, (x0 - r.x) * kx, (y0 - r.y) * ky, (x1 - x0) * kx, (y1 - y0) * ky);
    }
    const px = ctx.getImageData(0, 0, w, h).data;
    const data = new Float32Array(w * h);
    for (let k = 0; k < data.length; k++) data[k] = 0.299 * px[4 * k] + 0.587 * px[4 * k + 1] + 0.114 * px[4 * k + 2];
    return { width: w, height: h, data };
  };
};

/** Resolves once the video has a frame to draw. */
export const frameReady = (v: HTMLVideoElement): Promise<void> => new Promise((resolve) => {
  if (v.readyState >= 2) resolve();
  else v.addEventListener('loadeddata', () => resolve(), { once: true });
});
