// Browser-only helpers for video: stepping through a <video> frame by frame, and opening the back camera.

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
