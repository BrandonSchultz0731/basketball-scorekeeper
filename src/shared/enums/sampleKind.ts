/** Why the eval page sampled a frame. */
export enum SAMPLE_KIND {
  /** Around a labeled make or tricky miss. */
  EVENT = 'event',
  /** Away from any label at that basket. A ball can still be there (ordinary misses aren't labeled). */
  QUIET = 'quiet',
}
