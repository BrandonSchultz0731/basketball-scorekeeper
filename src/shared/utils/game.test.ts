import { describe, expect, it } from 'vitest';
import { EVENT_SOURCE, GAME_EVENT_KIND, GAME_STATUS, HOOP, SHOT } from '../enums';
import type { Game, Settings } from '../types';
import { announcementFor } from './announcement';
import {
  DEFAULT_SETTINGS, addAdjustment, addScore, createGame, editEvent, endGame, removeEvent, scoreOf, undoLast, winnerOf,
} from './game';

const settings = (over: Partial<Settings['scoring']> = {}): Settings => {
  const s = structuredClone(DEFAULT_SETTINGS);
  return { ...s, hoopNames: { [HOOP.LEFT]: 'door side', [HOOP.RIGHT]: 'window side' }, scoring: { ...s.scoring, ...over } };
};

/** Plays a list of [hoop, shot] makes into a fresh game. */
const play = (s: Settings, makes: [HOOP, SHOT][]): Game =>
  makes.reduce((g, [hoop, shot]) => addScore(g, { hoop, shot }), createGame(s));

const twos = (hoop: HOOP, n: number): [HOOP, SHOT][] => Array.from({ length: n }, () => [hoop, SHOT.SHORT]);

describe('scoring', () => {
  it('starts live at 0-0', () => {
    const g = createGame(settings());
    expect(g.status).toBe(GAME_STATUS.LIVE);
    expect(scoreOf(g.events)).toEqual({ [HOOP.LEFT]: 0, [HOOP.RIGHT]: 0 });
  });

  it('uses the configured point values and records them on the event', () => {
    const g = play(settings({ points: { [SHOT.SHORT]: 1, [SHOT.LONG]: 2 } }), [[HOOP.LEFT, SHOT.SHORT], [HOOP.LEFT, SHOT.LONG]]);
    expect(scoreOf(g.events)[HOOP.LEFT]).toBe(3);
    expect(g.events.map((e) => e.points)).toEqual([1, 2]);
    expect(g.events[0].source).toBe(EVENT_SOURCE.MANUAL);
  });

  it('keeps the rules it started with when settings change later', () => {
    const s = settings();
    const g = createGame(s);
    s.scoring.points[SHOT.SHORT] = 1;
    expect(addScore(g, { hoop: HOOP.LEFT, shot: SHOT.SHORT }).events[0].points).toBe(2);
  });
});

describe('winning', () => {
  it('ends the game at the target when win-by-2 is satisfied', () => {
    const g = play(settings(), [...twos(HOOP.LEFT, 10), [HOOP.LEFT, SHOT.LONG]]); // 23-0
    expect(g.status).toBe(GAME_STATUS.FINAL);
    expect(g.endedAt).not.toBeNull();
    expect(winnerOf(scoreOf(g.events), g.scoring)).toBe(HOOP.LEFT);
  });

  it('keeps playing at the target without a 2-point lead', () => {
    // 20-20, then left scores 2 -> 22-20 wins; but 21-20 should not.
    const s = settings({ points: { [SHOT.SHORT]: 1, [SHOT.LONG]: 2 } });
    let g = play(s, [...twos(HOOP.LEFT, 20), ...twos(HOOP.RIGHT, 20)]);
    g = addScore(g, { hoop: HOOP.LEFT, shot: SHOT.SHORT }); // 21-20
    expect(g.status).toBe(GAME_STATUS.LIVE);
    g = addScore(g, { hoop: HOOP.LEFT, shot: SHOT.SHORT }); // 22-20
    expect(g.status).toBe(GAME_STATUS.FINAL);
  });

  it('wins by 1 when win-by-2 is off', () => {
    const s = settings({ points: { [SHOT.SHORT]: 1, [SHOT.LONG]: 2 }, winByTwo: false });
    const g = play(s, [...twos(HOOP.LEFT, 20), ...twos(HOOP.RIGHT, 20), [HOOP.RIGHT, SHOT.SHORT]]);
    expect(g.status).toBe(GAME_STATUS.FINAL);
    expect(winnerOf(scoreOf(g.events), g.scoring)).toBe(HOOP.RIGHT);
  });

  it('ignores scores once final', () => {
    const g = play(settings(), [...twos(HOOP.LEFT, 10), [HOOP.LEFT, SHOT.LONG]]);
    expect(addScore(g, { hoop: HOOP.RIGHT, shot: SHOT.LONG })).toBe(g);
    expect(addAdjustment(g, HOOP.RIGHT, -1)).toBe(g);
  });
});

describe('corrections', () => {
  it('applies a manual adjustment', () => {
    const g = addAdjustment(play(settings(), [[HOOP.RIGHT, SHOT.LONG]]), HOOP.RIGHT, -1);
    expect(scoreOf(g.events)[HOOP.RIGHT]).toBe(2);
    expect(g.events[1].kind).toBe(GAME_EVENT_KIND.ADJUST);
  });

  it('undo of the winning basket reopens the game', () => {
    const g = play(settings(), [...twos(HOOP.LEFT, 10), [HOOP.LEFT, SHOT.LONG]]);
    const u = undoLast(g);
    expect(u.status).toBe(GAME_STATUS.LIVE);
    expect(u.endedAt).toBeNull();
    expect(scoreOf(u.events)[HOOP.LEFT]).toBe(20);
  });

  it('editing a winning basket to the other hoop reopens the game', () => {
    const g = play(settings(), [...twos(HOOP.LEFT, 10), [HOOP.LEFT, SHOT.LONG]]);
    const last = g.events[g.events.length - 1];
    expect(editEvent(g, last.id, { hoop: HOOP.RIGHT }).status).toBe(GAME_STATUS.LIVE);
  });

  it('editing the shot re-prices the event and clears uncertain', () => {
    let g = addScore(createGame(settings()), { hoop: HOOP.LEFT, shot: SHOT.SHORT, source: EVENT_SOURCE.AUTO, uncertain: true });
    g = editEvent(g, g.events[0].id, { shot: SHOT.LONG });
    expect(g.events[0]).toMatchObject({ points: 3, shot: SHOT.LONG, source: EVENT_SOURCE.AUTO });
    expect(g.events[0].uncertain).toBeUndefined();
  });

  it('removing an event updates the score', () => {
    const g = play(settings(), [[HOOP.LEFT, SHOT.LONG], [HOOP.RIGHT, SHOT.SHORT]]);
    expect(scoreOf(removeEvent(g, g.events[0].id).events)).toEqual({ [HOOP.LEFT]: 0, [HOOP.RIGHT]: 2 });
  });

  it('a game ended early stays final when its log is edited', () => {
    let g = endGame(play(settings(), [[HOOP.LEFT, SHOT.LONG]]));
    expect(g).toMatchObject({ status: GAME_STATUS.FINAL, endedEarly: true });
    g = removeEvent(g, g.events[0].id);
    expect(g.status).toBe(GAME_STATUS.FINAL);
  });
});

describe('announcements', () => {
  it('says the points, the scoring side and its score first', () => {
    const g = play(settings(), [[HOOP.RIGHT, SHOT.SHORT], [HOOP.LEFT, SHOT.LONG]]);
    expect(announcementFor(g, g.events[1])).toBe('three, door side, 3 to 2');
  });

  it('announces the winner when the game ends', () => {
    const g = play(settings(), [[HOOP.RIGHT, SHOT.SHORT], ...twos(HOOP.LEFT, 10), [HOOP.LEFT, SHOT.LONG]]);
    expect(announcementFor(g, g.events[g.events.length - 1])).toBe('game, door side wins, 23 to 2');
  });

  it('announces corrections', () => {
    const g = addAdjustment(play(settings(), [[HOOP.LEFT, SHOT.LONG]]), HOOP.LEFT, -1);
    expect(announcementFor(g, g.events[1])).toBe('correction, door side, 2 to 0');
  });
});
