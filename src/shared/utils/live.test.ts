import { describe, expect, it } from 'vitest';
import { GAME_EVENT_KIND, HOOP, LIVE_STATUS, SHOT } from '../enums';
import type { Settings } from '../types';
import { DEFAULT_SETTINGS, addScore, createGame } from './game';
import { LIVE_RECENT_COUNT, generateRoomCode, isRoomCode, normalizeRoomCode, toLiveState } from './live';

const settings = (): Settings => structuredClone(DEFAULT_SETTINGS);

/** Firebase rejects undefined anywhere in a write. */
const hasUndefined = (v: unknown): boolean =>
  v === undefined || (typeof v === 'object' && v !== null && Object.values(v).some(hasUndefined));

describe('toLiveState', () => {
  it('is idle with the settings names before any game', () => {
    const s = settings();
    s.hoopNames[HOOP.LEFT] = 'door side';
    const live = toLiveState(null, s);
    expect(live).toMatchObject({ status: LIVE_STATUS.IDLE, score: { [HOOP.LEFT]: 0, [HOOP.RIGHT]: 0 }, target: 21, recent: [] });
    expect(live.hoopNames[HOOP.LEFT]).toBe('door side');
    expect(hasUndefined(live)).toBe(false);
  });

  it('shows the live score and the last few baskets, newest first', () => {
    let g = createGame(settings());
    for (let i = 0; i < 7; i++) g = addScore(g, { hoop: i % 2 ? HOOP.RIGHT : HOOP.LEFT, shot: SHOT.SHORT }, 1000 + i);
    const live = toLiveState(g, settings());
    expect(live.status).toBe(LIVE_STATUS.LIVE);
    expect(live.score).toEqual({ [HOOP.LEFT]: 8, [HOOP.RIGHT]: 6 });
    expect(live.recent).toHaveLength(LIVE_RECENT_COUNT);
    expect(live.recent[0]).toEqual({ hoop: HOOP.LEFT, kind: GAME_EVENT_KIND.SCORE, points: 2, at: 1006 });
    expect(live.winner).toBeUndefined();
    expect('winner' in live).toBe(false); // left out, not undefined
    expect(hasUndefined(live)).toBe(false);
  });

  it('is final with a winner once the game is won', () => {
    let g = createGame(settings());
    for (let i = 0; i < 7; i++) g = addScore(g, { hoop: HOOP.RIGHT, shot: SHOT.LONG });
    expect(toLiveState(g, settings())).toMatchObject({ status: LIVE_STATUS.FINAL, winner: HOOP.RIGHT });
  });

  it('keeps the names the game started with', () => {
    const s = settings();
    const g = createGame(s);
    s.hoopNames[HOOP.LEFT] = 'renamed';
    expect(toLiveState(g, s).hoopNames[HOOP.LEFT]).toBe(DEFAULT_SETTINGS.hoopNames[HOOP.LEFT]);
  });
});

describe('room codes', () => {
  it('generates valid 6-character codes without look-alike characters', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode();
      expect(isRoomCode(code)).toBe(true);
      expect(code).not.toMatch(/[01ILO]/);
    }
  });

  it('matches the pattern in database.rules.json', () => {
    for (let i = 0; i < 200; i++) expect(generateRoomCode()).toMatch(/^[2-9A-HJKMNP-Z]{6}$/);
  });

  it('normalizes what people type', () => {
    expect(normalizeRoomCode(' #k7q-2xm ')).toBe('K7Q2XM');
    expect(isRoomCode('K7Q2XM')).toBe(true);
    expect(isRoomCode('K7Q2X')).toBe(false);
    expect(isRoomCode('K7Q2XO')).toBe(false);
  });
});
