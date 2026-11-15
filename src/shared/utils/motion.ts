/**
 * How much a small thumbnail changed between two frames: the mean absolute difference in brightness, 0 to 255.
 * Both are RGBA of the same size. Used to skip the detector at a rim where nothing is moving.
 */
export const motionLevel = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => {
  if (a.length !== b.length || a.length === 0) return 0;
  let sum = 0;
  for (let p = 0; p < a.length; p += 4) {
    const la = 0.299 * a[p] + 0.587 * a[p + 1] + 0.114 * a[p + 2];
    const lb = 0.299 * b[p] + 0.587 * b[p + 1] + 0.114 * b[p + 2];
    sum += Math.abs(la - lb);
  }
  return sum / (a.length / 4);
};
