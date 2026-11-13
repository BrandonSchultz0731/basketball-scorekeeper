// Reading and writing a live-score room in Firebase Realtime Database: rooms/{code}.
import {
  onDisconnect, onValue, ref, remove, serverTimestamp, set, type Unsubscribe,
} from 'firebase/database';
import type { LiveState, Room, StartRequest } from '../types';
import { generateRoomCode } from '../utils';
import { firebase, signIn } from './firebase';

const roomPath = (code: string) => `rooms/${code}`;

/**
 * Creates a room owned by this phone and returns its code. The rules reject a code that's already
 * taken, so a collision just means trying another code.
 */
export const createRoom = async (): Promise<string> => {
  const user = await signIn();
  const { db } = firebase();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();
    try {
      await set(ref(db, roomPath(code)), { owner: user.uid, createdAt: serverTimestamp() });
      return code;
    } catch {
      // taken (permission denied) or a transient failure: try another code
    }
  }
  throw new Error("Couldn't create a live-score room. Check the connection and try again.");
};

/**
 * Publishes what viewers see. Firebase queues writes while offline and sends the latest when the
 * connection returns, so scoring never waits on this.
 */
export const publishLive = async (code: string, state: LiveState): Promise<void> => {
  await signIn();
  await set(ref(firebase().db, `${roomPath(code)}/live`), { ...state, updatedAt: serverTimestamp() });
};

/**
 * Marks the camera phone online while it's connected. Firebase's server flips it to false when the
 * connection drops, so viewers can tell the score may be out of date.
 */
export const keepOnline = (code: string): Unsubscribe => {
  const { db } = firebase();
  const onlineRef = ref(db, `${roomPath(code)}/online`);
  const stop = onValue(ref(db, '.info/connected'), (snap) => {
    if (snap.val() !== true) return;
    onDisconnect(onlineRef).set(false)
      .then(() => set(onlineRef, true))
      .catch(() => { /* retried on the next reconnect */ });
  });
  return () => {
    stop();
    // Drop the server-side "mark offline when disconnected" too, so it can't fire after switching rooms.
    onDisconnect(onlineRef).cancel().catch(() => {});
    set(onlineRef, false).catch(() => {});
  };
};

/** Deletes a room. Only its owner can; the old link then shows "No game with that code". */
export const deleteRoom = async (code: string): Promise<void> => {
  await signIn();
  await remove(ref(firebase().db, roomPath(code)));
};

/** Calls back with the room on every change, or null if there's no room with that code. */
export const watchRoom = (code: string, onRoom: (room: Room | null) => void, onError: (err: Error) => void): Unsubscribe =>
  onValue(ref(firebase().db, roomPath(code)), (snap) => onRoom(snap.val() as Room | null), onError);

/** Calls back with whether this browser is connected to Firebase right now. */
export const watchConnected = (onChange: (connected: boolean) => void): Unsubscribe =>
  onValue(ref(firebase().db, '.info/connected'), (snap) => onChange(snap.val() === true));

/** A viewer asks the camera phone to start the next game. The rules only allow it when no game is live. */
export const requestNextGame = async (code: string): Promise<void> => {
  const user = await signIn();
  await set(ref(firebase().db, `${roomPath(code)}/startRequest`), { at: serverTimestamp(), by: user.uid });
};

/** The camera phone watches for start requests from viewers. */
export const watchStartRequests = (code: string, onRequest: (req: StartRequest | null) => void): Unsubscribe =>
  onValue(ref(firebase().db, `${roomPath(code)}/startRequest`), (snap) => onRequest(snap.val() as StartRequest | null));

export const clearStartRequest = async (code: string): Promise<void> => {
  await remove(ref(firebase().db, `${roomPath(code)}/startRequest`));
};
