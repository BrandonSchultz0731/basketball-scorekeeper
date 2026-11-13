import type { EVENT_SOURCE, GAME_EVENT_KIND, GAME_STATUS, HOOP, SHOT } from '../enums';

export interface ScoringSettings {
  /** Points for each kind of make, e.g. { short: 2, long: 3 } or { short: 1, long: 2 }. */
  points: Record<SHOT, number>;
  /** Score needed to win. */
  target: number;
  /** Require a lead of at least 2 to win. */
  winByTwo: boolean;
}

export interface Settings {
  scoring: ScoringSettings;
  /** Landmark names for the baskets, e.g. "door side". */
  hoopNames: Record<HOOP, string>;
  /** Speak each score out loud. */
  speech: boolean;
}

interface EventBase {
  id: string;
  /** When it happened, epoch ms. */
  at: number;
  hoop: HOOP;
  source: EVENT_SOURCE;
  /** Set by automatic detection when it's unsure; shown for review after the game. */
  uncertain?: boolean;
}

export type GameEvent =
  | (EventBase & { kind: GAME_EVENT_KIND.SCORE; shot: SHOT; points: number })
  | (EventBase & { kind: GAME_EVENT_KIND.ADJUST; points: number });

export interface Game {
  id: string;
  startedAt: number;
  endedAt: number | null;
  status: GAME_STATUS;
  /** Ended by hand before anyone won. Such a game stays final even if its log is edited. */
  endedEarly: boolean;
  /** Scoring rules this game is played under, copied at the start so later setting changes don't rewrite it. */
  scoring: ScoringSettings;
  /** Basket names at the time, so history reads correctly after renames. */
  hoopNames: Record<HOOP, string>;
  /** The source of truth. The score is always derived from this. */
  events: GameEvent[];
}

export type Score = Record<HOOP, number>;
