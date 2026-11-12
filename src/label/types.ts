import type { HOOP } from '../shared/enums';

/** Label file format. Times are seconds from the start of the video. */
export enum LABEL_EVENT_KIND {
  MAKE = 'make',
  /** A miss worth grading against: one that could look like a make from the sideline. Ordinary misses aren't labeled. */
  MISS = 'miss',
  GAME_START = 'game_start',
  GAME_END = 'game_end',
}

/** What kind of tricky miss it was. Optional on a miss label. */
export enum MISS_TYPE {
  FRONT_AIRBALL = 'front_airball',
  BEHIND_NET = 'behind_net',
  BACK_RIM_DOWN = 'back_rim_down',
  RIM_OUT = 'rim_out',
  NET_TOUCH = 'net_touch',
  OTHER = 'other',
}

export type LabelEvent =
  | { kind: LABEL_EVENT_KIND.MAKE; t: number; hoop: HOOP; points: 2 | 3; uncertain?: boolean; note?: string }
  | { kind: LABEL_EVENT_KIND.MISS; t: number; hoop: HOOP; missType?: MISS_TYPE; uncertain?: boolean; note?: string }
  | { kind: LABEL_EVENT_KIND.GAME_START | LABEL_EVENT_KIND.GAME_END; t: number; note?: string };

export interface LabelFile {
  version: 1;
  video: { name: string; size: number; duration: number };
  /** Optional landmark names, e.g. "door side". Hoops are left/right as seen in the image. */
  hoopNames?: Record<HOOP, string>;
  events: LabelEvent[];
}
