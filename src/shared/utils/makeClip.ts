// The make/miss model's input, built from frames buffered around a call. Must match training/make_clips.py and
// training/train_make.py, which made the clips the model was trained on.
import type { Crop, Rim } from '../types';

export const MAKE_CLIP = {
  /** The square around the rim: this many rim widths across, centered this far below the rim top (rim widths). */
  widths: 2.5,
  shift: 0.6,
  /** Buffered frames are scaled to this size; the model sees the center `crop` of them. */
  size: 96,
  crop: 80,
  /** Frames used, in frames at 30 fps from the call: first, first + step, … (`count` of them). */
  first: -8,
  step: 3,
  count: 10,
  fps: 30,
} as const;

/** How long after a call the last clip frame is taken, in seconds. Wait this long before checking a call. */
export const MAKE_CLIP_AFTER = (MAKE_CLIP.first + MAKE_CLIP.step * (MAKE_CLIP.count - 1)) / MAKE_CLIP.fps;

/** The square around a rim that the clip is cut from, kept inside the frame. */
export const rimSquare = (rim: Rim, frameWidth: number, frameHeight: number): Crop => {
  const side = Math.round(Math.min(MAKE_CLIP.widths * rim.width, frameWidth, frameHeight));
  const cx = rim.x, cy = rim.y + MAKE_CLIP.shift * rim.width;
  return {
    x: Math.round(Math.max(0, Math.min(frameWidth - side, cx - side / 2))),
    y: Math.round(Math.max(0, Math.min(frameHeight - side, cy - side / 2))),
    side,
  };
};

/** The video times of the clip frames for a call at `t` seconds. */
export const clipFrameTimes = (t: number): number[] =>
  Array.from({ length: MAKE_CLIP.count }, (_, k) => t + (MAKE_CLIP.first + MAKE_CLIP.step * k) / MAKE_CLIP.fps);

/**
 * The model input from the clip frames (RGBA, `MAKE_CLIP.size` square each): the center crop of every frame, as
 * B, G, R channels from 0 to 1 minus 0.5, stacked frame after frame, `[count * 3, crop, crop]`.
 */
export const makeClipInput = (frames: Uint8ClampedArray[]): Float32Array => {
  const { size, crop, count } = MAKE_CLIP;
  if (frames.length !== count) throw new Error(`need ${count} frames, got ${frames.length}`);
  const off = (size - crop) / 2, n = crop * crop;
  const out = new Float32Array(count * 3 * n);
  frames.forEach((rgba, k) => {
    for (let y = 0; y < crop; y++) {
      for (let x = 0; x < crop; x++) {
        const p = ((y + off) * size + (x + off)) * 4, i = y * crop + x;
        out[(k * 3) * n + i] = rgba[p + 2] / 255 - 0.5;
        out[(k * 3 + 1) * n + i] = rgba[p + 1] / 255 - 0.5;
        out[(k * 3 + 2) * n + i] = rgba[p] / 255 - 0.5;
      }
    }
  });
  return out;
};
