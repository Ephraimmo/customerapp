import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getDatabase,
  onValue,
  ref,
  set,
  type Database,
  type DatabaseReference,
} from "firebase/database";

/**
 * Firebase web config. The Realtime Database URL is all that is required for
 * reads; the apiKey is a publishable client key used only by Firebase Auth and
 * is injected via VITE_FIREBASE_API_KEY when present.
 */
export const firebaseConfig = {
  apiKey: (import.meta.env["VITE_FIREBASE_API_KEY"] as string | undefined) ?? "",
  authDomain: "e-comm-bd997.firebaseapp.com",
  databaseURL: "https://e-comm-bd997-default-rtdb.firebaseio.com",
  projectId: "e-comm-bd997",
  storageBucket: "e-comm-bd997.appspot.com",
  messagingSenderId: "280613901400",
  appId: "1:280613901400:web:bf168e55508b9102dda62d",
};

let cachedApp: FirebaseApp | null = null;
let cachedDb: Database | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === "undefined") return null;
  if (cachedApp) return cachedApp;
  cachedApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
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

export { onValue, ref, set };
export type { DatabaseReference };
