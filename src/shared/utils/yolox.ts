// YOLOX pre/post-processing for the official COCO ONNX exports (raw head outputs,
// sigmoid already applied to objectness and class scores, boxes not yet decoded).

import type { COCO_CLASS } from '../enums';
import type { Detection } from '../types';

/** RGBA pixels (size x size) -> float32 CHW tensor in BGR order, 0..255, as YOLOX expects. */
export const toTensorData = (rgba: Uint8ClampedArray, size: number): Float32Array => {
  const n = size * size;
  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    out[i] = rgba[p + 2];
    out[n + i] = rgba[p + 1];
    out[2 * n + i] = rgba[p];
  }
  return out;
};

const iou = (a: Detection, b: Detection): number => {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a.w * a.h + b.w * b.h - inter);
};

const nms = (dets: Detection[], thresh: number): Detection[] => {
  dets.sort((p, q) => q.score - p.score);
  const kept: Detection[] = [];
  for (const d of dets) {
    if (kept.every((k) => k.cls !== d.cls || iou(k, d) < thresh)) kept.push(d);
  }
  return kept;
};

/** Decode raw output [1, anchors, 5 + classes]. Only classes in `keep` are returned. */
export const decode = (
  raw: Float32Array,
  size: number,
  numClasses: number,
  keep: COCO_CLASS[],
  threshold: number,
): Detection[] => {
  const stride = 5 + numClasses;
  const dets: Detection[] = [];
  let a = 0;
  for (const s of [8, 16, 32]) {
    const g = size / s;
    for (let gy = 0; gy < g; gy++) {
      for (let gx = 0; gx < g; gx++, a++) {
        const o = a * stride;
        const obj = raw[o + 4];
        if (obj < threshold) continue;
        for (const c of keep) {
          const score = obj * raw[o + 5 + c];
          if (score < threshold) continue;
          const w = Math.exp(raw[o + 2]) * s;
          const h = Math.exp(raw[o + 3]) * s;
          const cx = (raw[o] + gx) * s;
          const cy = (raw[o + 1] + gy) * s;
          dets.push({ x: cx - w / 2, y: cy - h / 2, w, h, score, cls: c });
        }
      }
    }
  }
  return nms(dets, 0.45);
};

/**
 * Decode, keeping only the `wanted` COCO classes. `classes` says what each output class is, for fine-tuned models
 * with their own class list (e.g. [SPORTS_BALL] for a one-class ball model); leave it out for the 80 COCO classes.
 * Detections always come back labeled with COCO classes.
 */
export const decodeWanted = (
  raw: Float32Array,
  size: number,
  numClasses: number,
  wanted: COCO_CLASS[],
  threshold: number,
  classes?: COCO_CLASS[],
): Detection[] => {
  if (!classes) return decode(raw, size, numClasses, wanted, threshold);
  const keep = classes.flatMap((c, i) => (wanted.includes(c) ? [i as COCO_CLASS] : []));
  return decode(raw, size, numClasses, keep, threshold).map((d) => ({ ...d, cls: classes[d.cls] }));
};
