import { HOOP, LABEL_EVENT_KIND } from '../enums';
import type { GameCheck, LabelEvent, LabeledMake, MakeCall, MakeEvalResult } from '../types';

/** A call matches a labeled make at the same basket within this many seconds. */
export const MAKE_MATCH_TOLERANCE = 1;

export const labeledMakes = (events: LabelEvent[]): LabeledMake[] =>
  events.flatMap((e) => (e.kind === LABEL_EVENT_KIND.MAKE
    ? [{ hoop: e.hoop, t: e.t, uncertain: !!e.uncertain, offGame: !!e.offGame }]
    : []));

/**
 * Game spans from the labels' game start and end marks. A start with no end runs to `until`. Makes before the first
 * start or between games are shooting around.
 */
export const gameSpans = (events: LabelEvent[], until: number): { start: number; end: number }[] => {
  const spans: { start: number; end: number }[] = [];
  let start: number | null = null;
  for (const e of [...events].sort((a, b) => a.t - b.t)) {
    if (e.kind === LABEL_EVENT_KIND.GAME_START) start = e.t;
    else if (e.kind === LABEL_EVENT_KIND.GAME_END && start !== null) { spans.push({ start, end: e.t }); start = null; }
  }
  if (start !== null) spans.push({ start, end: until });
  return spans;
};

const countByHoop = (items: { hoop: HOOP }[]): Record<HOOP, number> => ({
  [HOOP.LEFT]: items.filter((i) => i.hoop === HOOP.LEFT).length,
  [HOOP.RIGHT]: items.filter((i) => i.hoop === HOOP.RIGHT).length,
});

/**
 * Grades make calls against the labels, up to `until` seconds (where the detections end).
 * - **Detection:** every labeled make counts, including "doesn't count" ones, since the ball really went in.
 * - **Games:** per game, the number of calls at each basket against the labeled makes that count. Until shots
 *   outside the game are handled, a "doesn't count" make that gets called makes that game wrong.
 */
export const evaluateMakes = (calls: MakeCall[], events: LabelEvent[], until: number, tolerance = MAKE_MATCH_TOLERANCE): MakeEvalResult => {
  const labels = labeledMakes(events).filter((m) => m.t <= until);
  const free = new Set(labels);
  const hits: MakeEvalResult['hits'] = [];
  const falseCalls: MakeCall[] = [];
  for (const call of [...calls].sort((a, b) => a.t - b.t)) {
    let best: LabeledMake | null = null;
    for (const m of free) {
      if (m.hoop === call.hoop && Math.abs(m.t - call.t) <= tolerance && (!best || Math.abs(m.t - call.t) < Math.abs(best.t - call.t))) best = m;
    }
    if (best) {
      free.delete(best);
      if (!best.uncertain) hits.push({ call, label: best });
    } else {
      falseCalls.push(call);
    }
  }
  const missed = labels.filter((m) => free.has(m) && !m.uncertain);
  // Games that start after the detections end can't be graded; one cut short is graded up to `until`.
  const games: GameCheck[] = gameSpans(events, until).filter((g) => g.start < until).map(({ start, end: gameEnd }) => {
    const end = Math.min(gameEnd, until);
    const inGame = <T extends { t: number }>(x: T) => x.t >= start && x.t <= end + tolerance;
    const labeled = countByHoop(labels.filter((m) => inGame(m) && !m.offGame));
    const called = countByHoop(calls.filter(inGame));
    return { start, end, labeled, called, correct: labeled[HOOP.LEFT] === called[HOOP.LEFT] && labeled[HOOP.RIGHT] === called[HOOP.RIGHT] };
  });
  const ratio = (a: number, b: number) => (a + b ? a / (a + b) : null);
  return { hits, missed, falseCalls, recall: ratio(hits.length, missed.length), precision: ratio(hits.length, falseCalls.length), games };
};
