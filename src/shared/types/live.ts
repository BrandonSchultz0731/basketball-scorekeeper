import type { GAME_EVENT_KIND, HOOP, LIVE_STATUS } from '../enums';
import type { Score } from './game';

/** One recent basket, as shown in the viewer's feed. */
export interface LiveEvent {
  hoop: HOOP;
  kind: GAME_EVENT_KIND;
  points: number;
  at: number;
}

/**
 * What the camera phone publishes for viewers: everything the viewer page shows, nothing more.
 * Stored at rooms/{code}/live. Firebase can't store undefined, so optional fields are left out, not undefined.
 */
export interface LiveState {
  status: LIVE_STATUS;
  hoopNames: Record<HOOP, string>;
  score: Score;
  target: number;
  winByTwo: boolean;
  /** Newest first, at most a few. */
  recent: LiveEvent[];
  gameId?: string;
  startedAt?: number;
  winner?: HOOP;
  /** Server time of the last publish (ms). Set by Firebase. */
  updatedAt?: number;
}

/** A request from a viewer phone to start the next game. */
export interface StartRequest {
  at: number;
  by: string;
}

/** Everything stored for a room at rooms/{code}. */
export interface Room {
  owner: string;
  createdAt: number;
  /** Whether the camera phone is connected right now. */
  online?: boolean;
  live?: LiveState;
  startRequest?: StartRequest;
}
