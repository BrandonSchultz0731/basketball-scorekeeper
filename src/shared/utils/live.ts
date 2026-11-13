// Pure helpers for the live score: building what gets published, and room codes.
import { GAME_STATUS, HOOP, LIVE_STATUS } from '../enums';
import type { Game, LiveState, Settings } from '../types';
import { scoreOf, winnerOf } from './game';

/** How many recent baskets viewers see. */
export const LIVE_RECENT_COUNT = 5;

/** What viewers should see for the current game (or none yet). */
export const toLiveState = (game: Game | null, settings: Settings): LiveState => {
  if (!game) {
    return {
      status: LIVE_STATUS.IDLE, hoopNames: { ...settings.hoopNames }, score: { [HOOP.LEFT]: 0, [HOOP.RIGHT]: 0 },
      target: settings.scoring.target, winByTwo: settings.scoring.winByTwo, recent: [],
    };
  }
  const score = scoreOf(game.events);
  const winner = winnerOf(score, game.scoring);
  const state: LiveState = {
    status: game.status === GAME_STATUS.LIVE ? LIVE_STATUS.LIVE : LIVE_STATUS.FINAL,
    hoopNames: { ...game.hoopNames },
    score,
    target: game.scoring.target,
    winByTwo: game.scoring.winByTwo,
    recent: game.events.slice(-LIVE_RECENT_COUNT).reverse().map((e) => ({ hoop: e.hoop, kind: e.kind, points: e.points, at: e.at })),
    gameId: game.id,
    startedAt: game.startedAt,
  };
  if (winner) state.winner = winner;
  return state;
};

/** No 0/O, 1/I/L: codes are read off a screen and typed in. */
const ROOM_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 6;

export const generateRoomCode = (random: () => number = Math.random): string =>
  Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_ALPHABET[Math.floor(random() * ROOM_ALPHABET.length)]).join('');

/** Uppercases and drops spaces, dashes and a leading '#', so "k7q-2xm" works. */
export const normalizeRoomCode = (input: string): string => input.toUpperCase().replace(/[^0-9A-Z]/g, '');

export const isRoomCode = (code: string): boolean =>
  code.length === ROOM_CODE_LENGTH && [...code].every((c) => ROOM_ALPHABET.includes(c));
