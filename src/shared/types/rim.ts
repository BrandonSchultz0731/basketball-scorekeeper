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
