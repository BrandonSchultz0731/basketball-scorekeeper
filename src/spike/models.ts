// Detector models the spike page can load. Files are downloaded into public/models by
// scripts/fetch-assets.mjs (keep the two lists in sync). All are COCO-pretrained YOLOX, Apache-2.0.

export enum DETECTOR_MODEL {
  NANO = 'yolox_nano',
  TINY = 'yolox_tiny',
  S = 'yolox_s',
}

export interface ModelInfo {
  label: string;
  file: string;
  /** Square input size in pixels. */
  size: number;
  megabytes: number;
}

export const MODELS: Record<DETECTOR_MODEL, ModelInfo> = {
  [DETECTOR_MODEL.NANO]: { label: 'YOLOX-nano', file: 'yolox_nano.onnx', size: 416, megabytes: 3.7 },
  [DETECTOR_MODEL.TINY]: { label: 'YOLOX-tiny', file: 'yolox_tiny.onnx', size: 416, megabytes: 20 },
  [DETECTOR_MODEL.S]: { label: 'YOLOX-s', file: 'yolox_s.onnx', size: 640, megabytes: 36 },
};

/**
 * Crop side as a multiple of the model input.
 * - 1: native pixels.
 * - >1: a bigger area, downscaled to fit.
 * - <1: a smaller area, enlarged to fit, which makes a distant ball look bigger to the model.
 */
export const CROP_SCALES = [0.5, 0.75, 1, 1.5, 2];

export const cropScaleLabel = (k: number): string => {
  if (k === 1) return 'native';
  return k < 1 ? `${+(1 / k).toFixed(2)}× up` : `${k}× down`;
};
