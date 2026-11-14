import { describe, expect, it } from 'vitest';
import { HOOP, LABEL_EVENT_KIND } from '../enums';
import type { LabelEvent, MakeCall } from '../types';
import { evaluateMakes, gameSpans } from './makeEval';

const make = (t: number, hoop = HOOP.LEFT, extra: Partial<{ uncertain: boolean; offGame: boolean }> = {}): LabelEvent =>
  ({ kind: LABEL_EVENT_KIND.MAKE, t, hoop, points: 2, ...extra });
const call = (t: number, hoop = HOOP.LEFT): MakeCall => ({ hoop, t, fromT: t - 0.5, path: [] });
const start = (t: number): LabelEvent => ({ kind: LABEL_EVENT_KIND.GAME_START, t });
const end = (t: number): LabelEvent => ({ kind: LABEL_EVENT_KIND.GAME_END, t });

describe('make eval', () => {
  it('matches calls to labels at the same basket within a second', () => {
    const r = evaluateMakes([call(10.4), call(20, HOOP.RIGHT), call(40)], [make(10), make(20), make(30)], 100);
    expect(r.hits.map((h) => h.label.t)).toEqual([10]);
    expect(r.missed.map((m) => m.t)).toEqual([20, 30]);
    expect(r.falseCalls.map((c) => c.t)).toEqual([20, 40]);
    expect(r.recall).toBeCloseTo(1 / 3);
    expect(r.precision).toBeCloseTo(1 / 3);
  });

  it('matches each label once', () => {
    const r = evaluateMakes([call(10), call(10.5)], [make(10)], 100);
    expect(r.hits).toHaveLength(1);
    expect(r.falseCalls).toHaveLength(1);
  });

  it('does not count uncertain makes either way', () => {
    const r = evaluateMakes([call(10)], [make(10, HOOP.LEFT, { uncertain: true }), make(20, HOOP.LEFT, { uncertain: true })], 100);
    expect(r.hits).toHaveLength(0);
    expect(r.missed).toHaveLength(0);
    expect(r.falseCalls).toHaveLength(0);
  });

  it('only grades labels before the detections end', () => {
    expect(evaluateMakes([], [make(10), make(200)], 100).missed).toHaveLength(1);
  });

  it('checks each game, leaving out makes that do not count', () => {
    const events = [make(5), start(10), make(20), make(30, HOOP.RIGHT), make(40, HOOP.LEFT, { offGame: true }), end(50), start(60), make(70)];
    const r = evaluateMakes([call(20), call(30, HOOP.RIGHT), call(70), call(71.5, HOOP.RIGHT)], events, 100);
    expect(r.games.map((g) => [g.labeled.left, g.labeled.right, g.called.left, g.called.right, g.correct])).toEqual([
      [1, 1, 1, 1, true],
      [1, 0, 1, 1, false],
    ]);
  });

  it('turns start and end marks into game spans', () => {
    expect(gameSpans([start(0), end(10), start(20)], 30)).toEqual([{ start: 0, end: 10 }, { start: 20, end: 30 }]);
  });
});
