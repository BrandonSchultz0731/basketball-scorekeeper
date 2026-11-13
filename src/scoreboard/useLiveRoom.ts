import { useCallback, useEffect, useRef, useState } from 'react';
import type { LiveState } from '../shared/types';

/** The camera phone's connection to its live-score room. */
export enum LIVE_CONNECTION {
  /** Live score isn't set up on this phone. */
  OFF = 'off',
  CONNECTING = 'connecting',
  ONLINE = 'online',
  /** Set up, but no connection right now. Scoring carries on; the latest score is sent on reconnect. */
  OFFLINE = 'offline',
  ERROR = 'error',
}

// Firebase is only loaded once live score is set up, so the scoreboard stays small and fully offline otherwise.
const loadLive = () => import('../shared/live');

/**
 * Publishes the current game to the room whenever it changes, keeps the room marked online, and passes
 * viewers' "start next game" requests to `onStartRequest`. That callback is read through a ref, because
 * the Firebase listener outlives renders (see the standards skill).
 */
export const useLiveRoom = (roomCode: string | null, liveState: LiveState | null, onStartRequest: () => void) => {
  const [connection, setConnection] = useState(LIVE_CONNECTION.OFF);
  const [error, setError] = useState('');
  const startRef = useRef(onStartRequest);
  startRef.current = onStartRequest;
  const lastPublished = useRef('');

  useEffect(() => {
    lastPublished.current = ''; // a new room needs a fresh publish
    if (!roomCode) { setConnection(LIVE_CONNECTION.OFF); return; }
    setConnection(LIVE_CONNECTION.CONNECTING);
    let cancelled = false;
    const stops: (() => void)[] = [];
    loadLive()
      .then(async (live) => {
        await live.signIn();
        if (cancelled) return;
        stops.push(live.keepOnline(roomCode));
        stops.push(live.watchConnected((c) => setConnection(c ? LIVE_CONNECTION.ONLINE : LIVE_CONNECTION.OFFLINE)));
        stops.push(live.watchStartRequests(roomCode, (req) => {
          if (!req) return;
          startRef.current();
          live.clearStartRequest(roomCode).catch(() => {});
        }));
      })
      .catch((err) => {
        if (cancelled) return;
        setConnection(LIVE_CONNECTION.ERROR);
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => { cancelled = true; stops.forEach((stop) => stop()); };
  }, [roomCode]);

  useEffect(() => {
    if (!roomCode || !liveState) return;
    const json = JSON.stringify(liveState);
    if (json === lastPublished.current) return;
    lastPublished.current = json;
    loadLive()
      .then((live) => live.publishLive(roomCode, liveState))
      .catch((err) => setError(`Couldn't publish the score: ${err instanceof Error ? err.message : err}`));
  }, [roomCode, liveState]);

  const createRoom = useCallback(async (): Promise<string> => (await loadLive()).createRoom(), []);

  /** Best effort: if it fails (e.g. offline), the old room is left behind but the new one still works. */
  const deleteRoom = useCallback(async (code: string): Promise<void> => {
    await (await loadLive()).deleteRoom(code).catch(() => {});
  }, []);

  return { connection, error, clearError: () => setError(''), createRoom, deleteRoom };
};
