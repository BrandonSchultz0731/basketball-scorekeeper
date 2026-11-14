import type { Crop, Detection, Rim } from '../types';

/**
 * How far below the top of the rim to put the crop's center, in rim widths. The ball arrives from above and
 * leaves through the net, which hangs about one rim width below the rim, so this keeps both in view.
 */
export const CROP_NET_SHIFT = 0.5;

/**
 * A square crop around a rim, `multiple` rim widths on each side, kept inside the frame.
 * Sizing the crop by the rim makes a ball the same size in the detector input at a near rim and a far one:
 * the ball is about half a rim, so it is about `inputSize / (2 * multiple)` pixels in the input.
 */
export const rimCrop = (rim: Rim, multiple: number, frameWidth: number, frameHeight: number): Crop => {
  const side = Math.round(Math.min(multiple * rim.width, frameWidth, frameHeight));
  const cx = rim.x, cy = rim.y + CROP_NET_SHIFT * rim.width;
  return {
    x: Math.round(Math.max(0, Math.min(frameWidth - side, cx - side / 2))),
    y: Math.round(Math.max(0, Math.min(frameHeight - side, cy - side / 2))),
    side,
  };
};

/** Maps a detection from detector-input pixels back to video pixels. */
export const toVideoBox = (d: Detection, crop: Crop, inputSize: number): Detection => {
  const k = crop.side / inputSize;
  return { ...d, x: crop.x + d.x * k, y: crop.y + d.y * k, w: d.w * k, h: d.h * k };
};

/** The crop size the label page previews, in rim widths. The eval page tries several. */
export const DEFAULT_RIM_CROP_MULTIPLE = 6;
