export const percentile = (xs: number[], p: number): number => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

export const fmt = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '–');

/** Counts presented video frames using requestVideoFrameCallback where available. */
export const watchFrameRate = (video: HTMLVideoElement, onRate: (fps: number, method: string) => void): () => void => {
  let stopped = false;
  const times: number[] = [];
  const push = (t: number) => {
    times.push(t);
    while (times.length > 1 && t - times[0] > 2000) times.shift();
    if (times.length > 1) onRate(((times.length - 1) * 1000) / (t - times[0]), method);
  };
  const rvfc = typeof video.requestVideoFrameCallback === 'function';
  const method = rvfc ? 'requestVideoFrameCallback' : 'rAF + currentTime';
  if (rvfc) {
    const tick = (now: number) => { if (stopped) return; push(now); video.requestVideoFrameCallback(tick); };
    video.requestVideoFrameCallback(tick);
  } else {
    let last = -1;
    const tick = (now: number) => {
      if (stopped) return;
      if (video.currentTime !== last) { last = video.currentTime; push(now); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  return () => { stopped = true; };
};
