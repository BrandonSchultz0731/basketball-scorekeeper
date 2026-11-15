// Detector models the pages can load. The COCO models are downloaded into public/models by
// scripts/fetch-assets.mjs (keep the two lists in sync); they are COCO-pretrained YOLOX, Apache-2.0.
// Fine-tuned models are made by training/train.py and copied into public/models by hand (see training/README.md).
import { COCO_CLASS } from '../enums';

export enum DETECTOR_MODEL {
  NANO = 'yolox_nano',
  TINY = 'yolox_tiny',
  S = 'yolox_s',
  /** YOLOX-s fine-tuned on court-1 bottom-left boxes (one class: ball). */
  S_BALL_V1 = 'yolox_s_ball_v1',
  /** YOLOX-s fine-tuned on court-1 bottom-left and court-2 bottom-right boxes (one class: ball). */
  S_BALL_V2 = 'yolox_s_ball_v2',
  /** ball_v2's clips plus the court-1 bird's-eye 5v5 game. */
  S_BALL_V3 = 'yolox_s_ball_v3',
}

export interface ModelInfo {
  label: string;
  file: string;
  /** Square input size in pixels. */
  size: number;
  megabytes: number;
  /** What each output class is. Leave out for the 80 COCO classes, where the index is the COCO class. */
  classes?: COCO_CLASS[];
  /** Made locally by training, not downloaded, so it only exists on the machine that trained it. */
  local?: boolean;
}

export const MODELS: Record<DETECTOR_MODEL, ModelInfo> = {
  [DETECTOR_MODEL.NANO]: { label: 'YOLOX-nano', file: 'yolox_nano.onnx', size: 416, megabytes: 3.7 },
  [DETECTOR_MODEL.TINY]: { label: 'YOLOX-tiny', file: 'yolox_tiny.onnx', size: 416, megabytes: 20 },
  [DETECTOR_MODEL.S]: { label: 'YOLOX-s', file: 'yolox_s.onnx', size: 640, megabytes: 36 },
  [DETECTOR_MODEL.S_BALL_V1]: {
    label: 'YOLOX-s ball v1 (fine-tuned)', file: 'yolox_s_ball_v1.onnx', size: 640, megabytes: 36,
    classes: [COCO_CLASS.SPORTS_BALL], local: true,
  },
  [DETECTOR_MODEL.S_BALL_V2]: {
    label: 'YOLOX-s ball v2 (fine-tuned)', file: 'yolox_s_ball_v2.onnx', size: 640, megabytes: 36,
    classes: [COCO_CLASS.SPORTS_BALL], local: true,
  },
  [DETECTOR_MODEL.S_BALL_V3]: {
    label: 'YOLOX-s ball v3 (fine-tuned)', file: 'yolox_s_ball_v3.onnx', size: 640, megabytes: 36,
    classes: [COCO_CLASS.SPORTS_BALL], local: true,
  },
};

/** The make/miss model (training/train_make.py), made locally like the fine-tuned ball models. */
export const MAKE_CHECK_MODEL = { label: 'make/miss v1', file: 'make_v1.onnx', local: true } as const;

/** Ball model used for live scoring. */
export const LIVE_BALL_MODEL = DETECTOR_MODEL.S_BALL_V3;

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
