import type { HOOP, LABEL_EVENT_KIND, MISS_TYPE } from '../enums';
import type { Rim } from './rim';

/** One labeled moment. Times are seconds from the start of the video. */
export type LabelEvent =
  | { kind: LABEL_EVENT_KIND.MAKE; t: number; hoop: HOOP; points: 2 | 3; uncertain?: boolean; note?: string }
  | { kind: LABEL_EVENT_KIND.MISS; t: number; hoop: HOOP; missType?: MISS_TYPE; uncertain?: boolean; note?: string }
  | { kind: LABEL_EVENT_KIND.GAME_START | LABEL_EVENT_KIND.GAME_END; t: number; note?: string };

/** A `*.labels.json` file, made by the label page. */
export interface LabelFile {
  version: 1;
  /** Width and height (video pixels) are recorded from files made after rim marking was added. */
  video: { name: string; size: number; duration: number; width?: number; height?: number };
  /** Optional landmark names, e.g. "door side". Hoops are left/right as seen in the image. */
  hoopNames?: Record<HOOP, string>;
  /** Where each game rim is in the image. Needed by the eval page to crop around the rims. */
  rims?: Partial<Record<HOOP, Rim>>;
  events: LabelEvent[];
}
