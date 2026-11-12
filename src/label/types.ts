import type { HOOP } from '../shared/enums';

/** Label file format. Times are seconds from the start of the video. */
export enum LABEL_EVENT_KIND {
  MAKE = 'make',
  GAME_START = 'game_start',
  GAME_END = 'game_end',
}

export type LabelEvent =
  | { kind: LABEL_EVENT_KIND.MAKE; t: number; hoop: HOOP; points: 2 | 3; uncertain?: boolean; note?: string }
  | { kind: LABEL_EVENT_KIND.GAME_START | LABEL_EVENT_KIND.GAME_END; t: number; note?: string };

export interface LabelFile {
  version: 1;
  video: { name: string; size: number; duration: number };
  /** Optional landmark names, e.g. "door side". Hoops are left/right as seen in the image. */
  hoopNames?: Record<HOOP, string>;
  events: LabelEvent[];
}
