// Firebase setup for the live score. This web config is meant to be public: it only identifies the
// project. What protects the data is database.rules.json.
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, type Auth, type User } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyB5nvr4xMJcZIIBYRnZPE8ehqN8NCq35II',
  authDomain: 'pickup-scorekeeper.firebaseapp.com',
  databaseURL: 'https://pickup-scorekeeper-default-rtdb.firebaseio.com',
  projectId: 'pickup-scorekeeper',
  storageBucket: 'pickup-scorekeeper.firebasestorage.app',
  messagingSenderId: '81110925672',
  appId: '1:81110925672:web:f9775a386d2840ffcdd6dd',
};

let app: FirebaseApp | null = null;

export const firebase = (): { auth: Auth; db: Database } => {
  app ??= initializeApp(FIREBASE_CONFIG);
  return { auth: getAuth(app), db: getDatabase(app) };
};

/**
 * Signs in anonymously (no account, nothing shown to the user) and returns the user. The ID is kept in
 * this browser's storage, so the camera phone stays the owner of its room across reloads. Clearing
 * Safari's website data, or switching between Safari and the home-screen app, gives a new ID.
 */
export const signIn = async (): Promise<User> => {
  const { auth } = firebase();
  await auth.authStateReady();
  return auth.currentUser ?? (await signInAnonymously(auth)).user;
};
