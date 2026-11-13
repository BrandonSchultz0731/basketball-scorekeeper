// Pure game rules. No React, storage or browser APIs, so they can be unit-tested and reused by the
// viewer page and the detection pipeline later.
import { EVENT_SOURCE, GAME_EVENT_KIND, GAME_STATUS, HOOP, SHOT } from '../enums';
import type { Game, GameEvent, Score, ScoringSettings, Settings } from '../types';
import { HOOPS, otherHoop } from './hoop';

const deepFreeze = <T extends object>(o: T): T => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
};

/** Read-only; copy with structuredClone before changing. */
export const DEFAULT_SETTINGS: Settings = deepFreeze({
  scoring: { points: { [SHOT.SHORT]: 2, [SHOT.LONG]: 3 }, target: 21, winByTwo: true },
  hoopNames: { [HOOP.LEFT]: 'left side', [HOOP.RIGHT]: 'right side' },
  speech: false,
  roomCode: null,
});

const newId = (): string => crypto.randomUUID();

export const createGame = (settings: Settings, now: number = Date.now()): Game => ({
  id: newId(),
  startedAt: now,
  endedAt: null,
  status: GAME_STATUS.LIVE,
  endedEarly: false,
  scoring: structuredClone(settings.scoring),
  hoopNames: { ...settings.hoopNames },
  events: [],
});

export const scoreOf = (events: GameEvent[]): Score => {
  const score: Score = { [HOOP.LEFT]: 0, [HOOP.RIGHT]: 0 };
  for (const e of events) score[e.hoop] += e.points;
  return score;
};

/** The winning basket under these rules, or null if nobody has won yet. */
export const winnerOf = (score: Score, scoring: ScoringSettings): HOOP | null => {
  for (const hoop of HOOPS) {
    const lead = score[hoop] - score[otherHoop(hoop)];
    if (score[hoop] >= scoring.target && lead >= (scoring.winByTwo ? 2 : 1)) return hoop;
  }
  return null;
};

/**
 * Keeps status consistent with the score after any change to the events:
 * - a live game with a winner becomes final;
 * - a final game that no longer has a winner (after undo, a deletion or an edit) goes back to live,
 *   unless it was ended early on purpose.
 */
const reconcile = (game: Game, now: number): Game => {
  const won = winnerOf(scoreOf(game.events), game.scoring) !== null;
  if (game.status === GAME_STATUS.LIVE && won) return { ...game, status: GAME_STATUS.FINAL, endedAt: now };
  if (game.status === GAME_STATUS.FINAL && !won && !game.endedEarly) return { ...game, status: GAME_STATUS.LIVE, endedAt: null };
  return game;
};

export interface ScoreInput {
  hoop: HOOP;
  shot: SHOT;
  source?: EVENT_SOURCE;
  uncertain?: boolean;
}

/** Records a made basket. Ignored once the game is final, so late detections can't change a result. */
export const addScore = (game: Game, input: ScoreInput, now: number = Date.now()): Game => {
  if (game.status !== GAME_STATUS.LIVE) return game;
  const event: GameEvent = {
    id: newId(), at: now, kind: GAME_EVENT_KIND.SCORE, hoop: input.hoop, shot: input.shot,
    points: game.scoring.points[input.shot], source: input.source ?? EVENT_SOURCE.MANUAL,
    ...(input.uncertain ? { uncertain: true } : {}),
  };
  return reconcile({ ...game, events: [...game.events, event] }, now);
};

/** Records a manual correction (e.g. −1). Allowed while live only. */
export const addAdjustment = (game: Game, hoop: HOOP, points: number, now: number = Date.now()): Game => {
  if (game.status !== GAME_STATUS.LIVE || points === 0) return game;
  const event: GameEvent = { id: newId(), at: now, kind: GAME_EVENT_KIND.ADJUST, hoop, points, source: EVENT_SOURCE.MANUAL };
  return reconcile({ ...game, events: [...game.events, event] }, now);
};

/** Removes the most recent event. Undoing the winning basket reopens the game. */
export const undoLast = (game: Game, now: number = Date.now()): Game =>
  game.events.length ? reconcile({ ...game, events: game.events.slice(0, -1) }, now) : game;

/** After-game editing: change an event's basket or shot. Points follow the game's own scoring rules. */
export const editEvent = (game: Game, id: string, patch: { hoop?: HOOP; shot?: SHOT }, now: number = Date.now()): Game =>
  reconcile({
    ...game,
    events: game.events.map((e) => {
      if (e.id !== id) return e;
      const hoop = patch.hoop ?? e.hoop;
      if (e.kind !== GAME_EVENT_KIND.SCORE) return { ...e, hoop };
      const shot = patch.shot ?? e.shot;
      // An edited event has been reviewed by a person, so it's no longer uncertain.
      const { uncertain: _reviewed, ...rest } = e;
      return { ...rest, hoop, shot, points: game.scoring.points[shot] };
    }),
  }, now);

export const removeEvent = (game: Game, id: string, now: number = Date.now()): Game =>
  reconcile({ ...game, events: game.events.filter((e) => e.id !== id) }, now);

/** Ends a game before anyone has won, e.g. it was abandoned. */
export const endGame = (game: Game, now: number = Date.now()): Game =>
  game.status === GAME_STATUS.LIVE ? { ...game, status: GAME_STATUS.FINAL, endedAt: now, endedEarly: true } : game;
