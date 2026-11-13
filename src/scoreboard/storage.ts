// Game history and settings, saved in the browser's IndexedDB on this phone.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Game, Settings } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/utils';

const DB_NAME = 'pickup-scorekeeper';
const DB_VERSION = 1;
const SETTINGS_KEY = 'settings';

interface ScoreboardDB extends DBSchema {
  games: { key: string; value: Game; indexes: { startedAt: number } };
  kv: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<ScoreboardDB>> | null = null;

const db = (): Promise<IDBPDatabase<ScoreboardDB>> => {
  dbPromise ??= openDB<ScoreboardDB>(DB_NAME, DB_VERSION, {
    upgrade: (d) => {
      d.createObjectStore('games', { keyPath: 'id' }).createIndex('startedAt', 'startedAt');
      d.createObjectStore('kv');
    },
  });
  return dbPromise;
};

/** Saved settings merged over the defaults, so settings added in later versions get their default. */
export const loadSettings = async (): Promise<Settings> => {
  const saved = (await (await db()).get('kv', SETTINGS_KEY)) as Partial<Settings> | undefined;
  const base = structuredClone(DEFAULT_SETTINGS);
  if (!saved) return base;
  return {
    ...base,
    ...saved,
    scoring: { ...base.scoring, ...saved.scoring, points: { ...base.scoring.points, ...saved.scoring?.points } },
    hoopNames: { ...base.hoopNames, ...saved.hoopNames },
  };
};

export const saveSettings = async (settings: Settings): Promise<void> => {
  await (await db()).put('kv', settings, SETTINGS_KEY);
};

export const saveGame = async (game: Game): Promise<void> => {
  await (await db()).put('games', game);
};

export const deleteGame = async (id: string): Promise<void> => {
  await (await db()).delete('games', id);
};

/** All games, newest first. */
export const listGames = async (): Promise<Game[]> =>
  (await (await db()).getAllFromIndex('games', 'startedAt')).reverse();
