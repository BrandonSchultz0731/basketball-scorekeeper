import type { HOOP } from '../enums';

/** Where a rim sits in the camera image, in video pixels. The camera doesn't move during a clip, so this is per clip. */
export interface Rim {
  /** Horizontal center of the rim, and the top of the rim. */
  x: number;
  y: number;
  /** Width of the rim from edge to edge, as it appears in the image. A ball is about half this. */
  width: number;
  /** Bottom of the net. Recorded by the label page's box marking. */
  netBottom?: number;
}

/** Rim marking in progress: which rim, and the first corner once it's been clicked. */
export interface RimMarking {
  hoop: HOOP;
  first: { x: number; y: number } | null;
}

/** Video pixels of an area, which can reach past the frame edges. */
export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A grayscale image, brightness 0–255, row by row. */
export interface GrayImage {
  width: number;
  height: number;
  data: Float32Array;
}

/**
 * A small grayscale picture of a confirmed rim with its backboard and net (rimRefRegion), saved to find the rim again
 * after the phone is mounted again (findRim).
 */
export interface RimReference {
  /** The rim as it was confirmed, and the frame size it was marked on. */
  rim: Rim;
  frameWidth: number;
  frameHeight: number;
  /** The picture, `width` x `height`, brightness 0–255 row by row. */
  width: number;
  height: number;
  pixels: number[];
}

/** Where findRim found a saved rim. */
export interface RimMatch {
  rim: Rim;
  /** How well the picture matched, -1 to 1. */
  score: number;
  /** Whether the match is good enough to use. */
  found: boolean;
}
