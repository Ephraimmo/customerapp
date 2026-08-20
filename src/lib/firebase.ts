import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getDatabase,
  get,
  onValue,
  ref,
  set,
  update,
  remove,
  type Database,
  type DatabaseReference,
  type Unsubscribe,
} from "firebase/database";

export const firebaseConfig = {
  apiKey:
    (import.meta.env["VITE_FIREBASE_API_KEY"] as string | undefined) ||
    "AIzaSyBCTflur84nQjEc-YdsD_p2sR8eI7BD6nA",
  authDomain: "e-comm-bd997.firebaseapp.com",
  databaseURL: "https://e-comm-bd997-default-rtdb.firebaseio.com",
  projectId: "e-comm-bd997",
  storageBucket: "e-comm-bd997.appspot.com",
  messagingSenderId: "280613901400",
  appId: "1:280613901400:web:bf168e55508b9102dda62d",
};

export type RTDBValue = unknown;

let cachedApp: FirebaseApp | null = null;
let cachedDb: Database | null = null;

export function isFirebaseAvailable(): boolean {
  return typeof window !== "undefined";
}

export function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === "undefined") return null;
  if (cachedApp) return cachedApp;
  const existing = getApps().find((a) => a.name === "forkfleet-customer") || getApps()[0];
  if (existing) {
    cachedApp = existing;
  } else {
    try {
      cachedApp = initializeApp(firebaseConfig, "forkfleet-customer");
    } catch {
      cachedApp = getApps()[0] || initializeApp(firebaseConfig);
    }
  }
  return cachedApp;
}

/** Realtime Database handle. Returns null during SSR so nothing runs server-side. */
export function getDb(): Database | null {
  if (typeof window === "undefined") return null;
  if (cachedDb) return cachedDb;
  const app = getFirebaseApp();
  if (!app) return null;
  cachedDb = getDatabase(app);
  return cachedDb;
}

export async function rtdbGet<T = RTDBValue>(path: string): Promise<T | null> {
  const db = getDb();
  if (!db) return null;
  try {
    const snapshot = await get(ref(db, path));
    return (snapshot.val() as T) ?? null;
  } catch (error) {
    console.warn(`[firebase] rtdbGet failed for "${path}":`, error);
    return null;
  }
}

export async function rtdbSet<T = unknown>(path: string, value: T): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await set(ref(db, path), value);
  } catch (error) {
    console.error(`[firebase] rtdbSet failed for "${path}":`, error);
    throw error;
  }
}

export async function rtdbUpdate(path: string, values: Record<string, unknown>): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await update(ref(db, path), values);
  } catch (error) {
    console.error(`[firebase] rtdbUpdate failed for "${path}":`, error);
    throw error;
  }
}

export async function rtdbRemove(path: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await remove(ref(db, path));
  } catch (error) {
    console.error(`[firebase] rtdbRemove failed for "${path}":`, error);
    throw error;
  }
}

export function rtdbSubscribe<T = RTDBValue>(
  path: string,
  callback: (data: T | null) => void,
): () => void {
  const db = getDb();
  if (!db) {
    callback(null);
    return () => {};
  }
  const unsubscribe: Unsubscribe = onValue(
    ref(db, path),
    (snap) => {
      callback((snap.val() as T) ?? null);
    },
    (error) => {
      console.warn(`[firebase] rtdbSubscribe failed for "${path}":`, error);
      callback(null);
    },
  );
  return () => {
    unsubscribe();
  };
}

export { get, onValue, ref, set, update, remove };
export type { DatabaseReference };
