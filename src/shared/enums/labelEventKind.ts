/** Kinds of event in a label file. */
export enum LABEL_EVENT_KIND {
  MAKE = 'make',
  /** A miss worth grading against: one that could look like a make from the side. Ordinary misses aren't labeled. */
  MISS = 'miss',
  GAME_START = 'game_start',
  GAME_END = 'game_end',
}
