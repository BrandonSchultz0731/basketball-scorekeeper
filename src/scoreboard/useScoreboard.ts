import { useCallback, useEffect, useRef, useState } from 'react';
import { GAME_STATUS, type HOOP, type SHOT } from '../shared/enums';
import type { Game, GameEvent, Settings } from '../shared/types';
import {
  addAdjustment, addScore, announcementFor, createGame, editEvent, endGame, removeEvent, undoLast, type ScoreInput,
} from '../shared/utils';
import { primeSpeech, speak } from './speech';
import { deleteGame, listGames, loadSettings, saveGame, saveSettings } from './storage';

/**
 * State for the scoreboard page: settings, the current game and history, all saved to IndexedDB.
 * Actions read from refs, not render-time state, so a detector calling them later from a long-running
 * loop always acts on the latest game (see the standards skill).
 */
export const useScoreboard = () => {
  const [settings, setSettingsState] = useState<Settings | null>(null);
  const [game, setGameState] = useState<Game | null>(null);
  const [history, setHistory] = useState<Game[]>([]);
  const [error, setError] = useState('');
  const live = useRef<{ settings: Settings | null; game: Game | null }>({ settings: null, game: null });

  const report = (err: unknown) => setError(err instanceof Error ? err.message : String(err));

  const refreshHistory = useCallback(() => listGames().then(setHistory).catch(report), []);

  useEffect(() => {
    Promise.all([loadSettings(), listGames()])
      .then(([s, games]) => {
        live.current = { settings: s, game: games[0] ?? null };
        setSettingsState(s);
        setGameState(games[0] ?? null);
        setHistory(games);
      })
      .catch(report);
  }, []);

  /** Shows a new version of the current game and saves it. */
  const commit = useCallback((next: Game, announce?: GameEvent) => {
    const prev = live.current.game;
    if (next === prev) return;
    live.current.game = next;
    setGameState(next);
    saveGame(next).then(refreshHistory).catch(report);
    if (announce && live.current.settings?.speech) speak(announcementFor(next, announce));
  }, [refreshHistory]);

  const updateSettings = useCallback((next: Settings) => {
    live.current.settings = next;
    setSettingsState(next);
    saveSettings(next).catch(report);
  }, []);

  /** Saves the room code into whatever the settings are now (not a copy from before an await). */
  const setRoomCode = useCallback((roomCode: string) => {
    const s = live.current.settings;
    if (s) updateSettings({ ...s, roomCode });
  }, [updateSettings]);

  const startGame = useCallback(() => {
    const s = live.current.settings;
    if (!s) return;
    if (s.speech) primeSpeech(); // must run inside the tap that starts the game (iOS)
    commit(createGame(s));
  }, [commit]);

  /** A viewer pressed "start next game". Ignored if a game is already live. */
  const startFromViewer = useCallback(() => {
    if (live.current.game?.status === GAME_STATUS.LIVE) return;
    startGame();
  }, [startGame]);

  const score = useCallback((input: ScoreInput) => {
    const g = live.current.game;
    if (!g) return;
    const next = addScore(g, input);
    commit(next, next.events[next.events.length - 1]);
  }, [commit]);

  const adjust = useCallback((hoop: HOOP, points: number) => {
    const g = live.current.game;
    if (!g) return;
    const next = addAdjustment(g, hoop, points);
    commit(next, next.events[next.events.length - 1]);
  }, [commit]);

  const undo = useCallback(() => { const g = live.current.game; if (g) commit(undoLast(g)); }, [commit]);
  const end = useCallback(() => { const g = live.current.game; if (g) commit(endGame(g)); }, [commit]);

  /** Edits an event in any game: the current one or one from history. */
  const editIn = useCallback((gameId: string, change: (g: Game) => Game) => {
    const current = live.current.game;
    if (current?.id === gameId) { commit(change(current)); return; }
    const old = history.find((h) => h.id === gameId);
    if (old) saveGame(change(old)).then(refreshHistory).catch(report);
  }, [commit, history, refreshHistory]);

  const edit = useCallback((gameId: string, eventId: string, patch: { hoop?: HOOP; shot?: SHOT }) =>
    editIn(gameId, (g) => editEvent(g, eventId, patch)), [editIn]);

  const remove = useCallback((gameId: string, eventId: string) =>
    editIn(gameId, (g) => removeEvent(g, eventId)), [editIn]);

  const forget = useCallback((gameId: string) => {
    if (live.current.game?.id === gameId) { live.current.game = null; setGameState(null); }
    deleteGame(gameId).then(refreshHistory).catch(report);
  }, [refreshHistory]);

  return {
    ready: settings !== null, settings, game, history, error, clearError: () => setError(''),
    updateSettings, setRoomCode, startGame, startFromViewer, score, adjust, undo, end, edit, remove, forget,
  };
};
