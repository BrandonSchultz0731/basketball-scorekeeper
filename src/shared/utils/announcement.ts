import { GAME_EVENT_KIND, GAME_STATUS } from '../enums';
import type { Game, GameEvent } from '../types';
import { scoreOf, winnerOf } from './game';
import { otherHoop } from './hoop';

const POINT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five'];

const pointsWord = (n: number): string => POINT_WORDS[n] ?? String(n);

/**
 * What to say after an event, e.g. "three, door side, 9 to 7" (the scoring side's score first).
 * When the event ends the game: "game, door side wins, 21 to 17".
 * Scores stay as digits; speech engines read them naturally.
 */
export const announcementFor = (game: Game, event: GameEvent): string => {
  const score = scoreOf(game.events);
  const name = game.hoopNames[event.hoop];
  const winner = game.status === GAME_STATUS.FINAL ? winnerOf(score, game.scoring) : null;
  if (winner) {
    return `game, ${game.hoopNames[winner]} wins, ${score[winner]} to ${score[otherHoop(winner)]}`;
  }
  const line = `${score[event.hoop]} to ${score[otherHoop(event.hoop)]}`;
  if (event.kind === GAME_EVENT_KIND.ADJUST) return `correction, ${name}, ${line}`;
  return `${pointsWord(event.points)}, ${name}, ${line}`;
};
