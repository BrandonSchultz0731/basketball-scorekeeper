// Finding a rim again after the phone has been taken down and mounted again. When rims are confirmed, a small
// grayscale picture of each rim, its backboard and net is saved. Next time, that picture is searched for near where
// the rim was, at a range of sizes, and the best match moves the rim box. The phone goes on the same mount, so the
// rim is close to where it was, a little shifted, bigger or smaller.
import type { GrayImage, Region, Rim, RimMatch, RimReference } from '../types';

/** The saved picture around a rim, in rim widths from the rim's center and top: the backboard above, the net below. */
export const RIM_REF_AREA = { side: 1.5, above: 1.5, belowNet: 0.3 };
/** Saved at this many pixels per rim width. The fine search runs at this size and the wide search at half. */
export const RIM_REF_PX = 32;

export interface RimFindSettings {
  /** How far the rim can have moved, in rim widths. */
  reach: number;
  /** The smallest and largest size change looked for, as a ratio of the old rim width, and the number of steps. */
  minScale: number;
  maxScale: number;
  scaleSteps: number;
  /** A match scoring below this (correlation, -1 to 1) is not trusted, and the rim must be marked again. */
  minScore: number;
}

export const DEFAULT_RIM_FIND: RimFindSettings = { reach: 4, minScale: 0.75, maxScale: 1.33, scaleSteps: 11, minScore: 0.7 };

/**
 * Grayscale pixels of `region` (video pixels, can reach past the frame edges) scaled to `outW` x `outH`. The Camera
 * tab draws the video into a small canvas; the eval and tests use `sampleGray`.
 */
export type GraySampler = (region: Region, outW: number, outH: number) => GrayImage;

/** The video area the saved picture covers, for a rim. */
export const rimRefRegion = (rim: Rim): Region => {
  const w = rim.width, net = (rim.netBottom ?? rim.y + w) - rim.y;
  return {
    x: rim.x - RIM_REF_AREA.side * w,
    y: rim.y - RIM_REF_AREA.above * w,
    w: 2 * RIM_REF_AREA.side * w,
    h: (RIM_REF_AREA.above + RIM_REF_AREA.belowNet) * w + net,
  };
};

const refSize = (rim: Rim) => {
  const r = rimRefRegion(rim);
  return { w: Math.round(r.w / rim.width * RIM_REF_PX), h: Math.round(r.h / rim.width * RIM_REF_PX) };
};

/** Saves the picture around a confirmed rim, to find it again next time. */
export const rimReference = (sample: GraySampler, rim: Rim, frame: { width: number; height: number }): RimReference => {
  const { w, h } = refSize(rim);
  const img = sample(rimRefRegion(rim), w, h);
  return {
    rim, frameWidth: frame.width, frameHeight: frame.height, width: w, height: h,
    pixels: Array.from(img.data, (v) => Math.round(Math.max(0, Math.min(255, v)))),
  };
};

/**
 * Grayscale of `region` of a full-resolution image at `outW` x `outH`, each output pixel the mean of the source
 * pixels under it (outside the image counts as the nearest edge pixel).
 */
export const sampleGray = (img: GrayImage, region: Region, outW: number, outH: number): GrayImage => {
  const out = new Float32Array(outW * outH);
  const kx = region.w / outW, ky = region.h / outH;
  const clampX = (x: number) => Math.max(0, Math.min(img.width - 1, x));
  const clampY = (y: number) => Math.max(0, Math.min(img.height - 1, y));
  for (let j = 0; j < outH; j++) {
    const y0 = Math.floor(region.y + j * ky), y1 = Math.max(y0 + 1, Math.floor(region.y + (j + 1) * ky));
    for (let i = 0; i < outW; i++) {
      const x0 = Math.floor(region.x + i * kx), x1 = Math.max(x0 + 1, Math.floor(region.x + (i + 1) * kx));
      let sum = 0;
      for (let y = y0; y < y1; y++) {
        const row = clampY(y) * img.width;
        for (let x = x0; x < x1; x++) sum += img.data[row + clampX(x)];
      }
      out[j * outW + i] = sum / ((y1 - y0) * (x1 - x0));
    }
  }
  return { width: outW, height: outH, data: out };
};

/** Halves an image in both directions (2x2 means). */
const half = (img: GrayImage): GrayImage => {
  const w = Math.floor(img.width / 2), h = Math.floor(img.height / 2);
  const out = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const a = 2 * j * img.width + 2 * i;
      out[j * w + i] = (img.data[a] + img.data[a + 1] + img.data[a + img.width] + img.data[a + img.width + 1]) / 4;
    }
  }
  return { width: w, height: h, data: out };
};

/**
 * Where `tmpl` best matches inside `img`: zero-mean normalized correlation at every position (1 is a perfect match,
 * and it ignores overall brightness and contrast changes).
 */
export const bestMatch = (img: GrayImage, tmpl: GrayImage): { x: number; y: number; score: number } => {
  const tw = tmpl.width, th = tmpl.height, n = tw * th;
  let tMean = 0;
  for (let k = 0; k < n; k++) tMean += tmpl.data[k];
  tMean /= n;
  const t = new Float32Array(n);
  let tVar = 0;
  for (let k = 0; k < n; k++) { t[k] = tmpl.data[k] - tMean; tVar += t[k] * t[k]; }
  // Sums and sums of squares over the image (summed-area tables), for each window's mean and spread.
  const W = img.width + 1;
  const s1 = new Float64Array(W * (img.height + 1)), s2 = new Float64Array(W * (img.height + 1));
  for (let y = 0; y < img.height; y++) {
    let r1 = 0, r2 = 0;
    for (let x = 0; x < img.width; x++) {
      const v = img.data[y * img.width + x];
      r1 += v; r2 += v * v;
      s1[(y + 1) * W + x + 1] = s1[y * W + x + 1] + r1;
      s2[(y + 1) * W + x + 1] = s2[y * W + x + 1] + r2;
    }
  }
  const box = (s: Float64Array, x: number, y: number) => s[(y + th) * W + x + tw] - s[y * W + x + tw] - s[(y + th) * W + x] + s[y * W + x];
  let best = { x: 0, y: 0, score: -Infinity };
  for (let y = 0; y + th <= img.height; y++) {
    for (let x = 0; x + tw <= img.width; x++) {
      let dot = 0;
      for (let j = 0; j < th; j++) {
        const row = (y + j) * img.width + x, trow = j * tw;
        for (let i = 0; i < tw; i++) dot += t[trow + i] * img.data[row + i];
      }
      const sum = box(s1, x, y);
      const iVar = box(s2, x, y) - sum * sum / n;
      const score = iVar > 1e-6 && tVar > 1e-6 ? dot / Math.sqrt(tVar * iVar) : 0;
      if (score > best.score) best = { x, y, score };
    }
  }
  return best;
};

/** The rim, `scale` times its old size, whose saved picture's top-left corner is at video point (x, y). */
const rimAt = (old: Rim, scale: number, x: number, y: number): Rim => {
  const w = old.width * scale;
  const top = y + RIM_REF_AREA.above * w;
  return { x: x + RIM_REF_AREA.side * w, y: top, width: w, netBottom: top + ((old.netBottom ?? old.y + old.width) - old.y) * scale };
};

/** A rim from an older frame size, scaled to this one (the camera can give a different resolution). */
const scaledRim = (rim: Rim, k: number): Rim => ({
  x: rim.x * k, y: rim.y * k, width: rim.width * k, ...(rim.netBottom !== undefined ? { netBottom: rim.netBottom * k } : {}),
});

/**
 * Looks for a saved rim near where it was. A wide search over the whole reach and every size at half resolution,
 * then a close search around the best one at full resolution. Returns the rim and how well it matched; `found` is
 * false when the match is too weak to trust (the rim is blocked, or the phone has moved too far).
 */
export const findRim = (
  sample: GraySampler, ref: RimReference, frame: { width: number; height: number },
  s: RimFindSettings = DEFAULT_RIM_FIND,
): RimMatch => {
  const old = scaledRim(ref.rim, frame.width / ref.frameWidth);
  const tmpl: GrayImage = { width: ref.width, height: ref.height, data: Float32Array.from(ref.pixels) };

  // Searches the area around `rim` (`reach` rim widths out each way) for the template at `px` pixels per rim width,
  // with the rim `scale` times its old size. Returns the matching rim.
  const search = (t: GrayImage, px: number, center: Rim, scale: number, reach: number) => {
    const w = old.width * scale, p = px / w;  // output pixels per video pixel
    const a = rimRefRegion({ ...center, width: w, netBottom: center.y + ((old.netBottom ?? old.y + old.width) - old.y) * scale });
    const region = { x: a.x - reach * w, y: a.y - reach * w, w: t.width / p + 2 * reach * w, h: t.height / p + 2 * reach * w };
    const img = sample(region, Math.round(region.w * p), Math.round(region.h * p));
    const m = bestMatch(img, t);
    return { rim: rimAt(old, scale, region.x + m.x / p, region.y + m.y / p), score: m.score, scale };
  };

  const coarse = half(tmpl);
  const scales = Array.from({ length: s.scaleSteps }, (_, i) =>
    s.minScale * (s.maxScale / s.minScale) ** (s.scaleSteps > 1 ? i / (s.scaleSteps - 1) : 0.5));
  let best = { rim: old, score: -Infinity, scale: 1 };
  for (const scale of scales) {
    const m = search(coarse, RIM_REF_PX / 2, old, scale, s.reach);
    if (m.score > best.score) best = m;
  }
  // Close search: a quarter rim width around the wide result, and sizes between its neighbors. Its scores are at
  // full resolution, so they're compared only with each other (half-resolution scores run higher).
  const step = (s.maxScale / s.minScale) ** (1 / Math.max(1, s.scaleSteps - 1));
  let fine = { rim: best.rim, score: -Infinity, scale: best.scale };
  for (const k of [step ** -0.5, step ** -0.25, 1, step ** 0.25, step ** 0.5]) {
    const m = search(tmpl, RIM_REF_PX, best.rim, best.scale * k, 0.25);
    if (m.score > fine.score) fine = m;
  }
  return { rim: fine.rim, score: fine.score, found: fine.score >= s.minScore };
};
