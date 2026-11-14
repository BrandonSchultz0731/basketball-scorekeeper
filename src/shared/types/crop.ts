/** A square region of the video frame, in video pixels, that is scaled to the detector's input. */
export interface Crop {
  /** Top-left corner. */
  x: number;
  y: number;
  /** Side length. */
  side: number;
}
