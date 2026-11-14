import type { HOOP } from '../enums';

/** The ball in one frame, as the make logic sees it: center and size in video pixels. */
export interface BallSighting {
  t: number;
  x: number;
  y: number;
  /** The larger side of the detection box. */
  size: number;
  score: number;
}

/** A make the make logic called. */
export interface MakeCall {
  hoop: HOOP;
  /** When the ball was seen in the net. */
  t: number;
  /** When the same ball was last seen above the rim. */
  fromT: number;
  /** The ball's path over the last `maxFall` seconds up to the call, for checking and tuning. */
  path: BallSighting[];
}

/**
 * Tuning for the make logic. Distances are in rim widths and times in seconds, so the same numbers work for a near
 * rim and a far one.
 */
export interface MakeSettings {
  /** Detections below this score are ignored. */
  minScore: number;
  /** Ball size range. A ball is about half a rim; heads and bags are bigger, specks smaller. */
  minSize: number;
  maxSize: number;
  /**
   * A detection counts as static (a wall fixture, a ball sitting by the wall) when something was found within
   * `staticRadius` of it in at least `staticShare` of the frames over the last `staticWindow` seconds.
   */
  staticWindow: number;
  staticRadius: number;
  staticShare: number;
  /** A ball track ends when the ball hasn't been seen for this long. */
  trackGap: number;
  /** How far a ball may move from where it was expected: `gateBase + maxSpeed * dt` rim widths. */
  gateBase: number;
  maxSpeed: number;
  /** "In the net": below `netEntry` of the way from rim top to net bottom, down to `belowNet` past the net bottom. */
  netEntry: number;
  belowNet: number;
  /** "In the net" also needs the ball within this distance of the rim's center line. */
  netHalfWidth: number;
  /** Before that, the same ball must have been above the rim top, within this distance of the rim's center line... */
  approachHalfWidth: number;
  /** ...and it must have crossed the rim top within this distance of the center line... */
  crossHalfWidth: number;
  /** ...at most this long before it was in the net. */
  maxFall: number;
  /** No second make at the same rim within this long. */
  cooldown: number;
}

/** A labeled make, as the make eval grades it. */
export interface LabeledMake {
  hoop: HOOP;
  t: number;
  /** Not sure it went in: neither a miss nor a false call if it's wrong. */
  uncertain: boolean;
  /** Went in but isn't a game basket ("doesn't count" in the labeler). */
  offGame: boolean;
}

/** One game's make count per basket: from the labels, and from the make logic. */
export interface GameCheck {
  start: number;
  end: number;
  labeled: Record<HOOP, number>;
  called: Record<HOOP, number>;
  correct: boolean;
}

/** How the make logic's calls compare with the labels. */
export interface MakeEvalResult {
  /** Calls that match a labeled make (same basket, within the tolerance), with that make. */
  hits: { call: MakeCall; label: LabeledMake }[];
  /** Labeled makes with no call. Uncertain ones aren't listed. */
  missed: LabeledMake[];
  /** Calls with no labeled make. Calls that matched an uncertain make aren't listed. */
  falseCalls: MakeCall[];
  /** hits / (hits + missed) and hits / (hits + falseCalls); null with nothing to divide by. */
  recall: number | null;
  precision: number | null;
  games: GameCheck[];
}
