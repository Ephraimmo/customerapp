import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  initializeFirestore,
  limit,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  setDoc,
  where,
  writeBatch,
  type CollectionReference,
  type DocumentReference,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";

import { perfListenerOpened, perfRecordRead, perfRecordSnapshot } from "./perf-log";

/**
 * Firebase config for the shared ForkFleet backend (`e-comm-bd997`).
 * `databaseURL` is intentionally absent — the Realtime Database is gone and
 * every read/write goes to Cloud Firestore (see docs handover §1).
 */
export const firebaseConfig = {
  apiKey:
    (import.meta.env["VITE_FIREBASE_API_KEY"] as string | undefined) ||
    "AIzaSyBCTflur84nQjEc-YdsD_p2sR8eI7BD6nA",
  authDomain: "e-comm-bd997.firebaseapp.com",
  projectId: "e-comm-bd997",
  storageBucket: "e-comm-bd997.appspot.com",
  messagingSenderId: "280613901400",
  appId: "1:280613901400:web:bf168e55508b9102dda62d",
};

/** Legacy alias kept so call sites don't churn. Any JSON value Firestore returns. */
export type RTDBValue = unknown;
export type FirestoreValue = unknown;

let cachedApp: FirebaseApp | null = null;
let cachedDb: Firestore | null = null;

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
      cachedApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
    }
  }
  return cachedApp;
}

/** Cloud Firestore handle. Returns null during SSR so nothing runs server-side. */
export function getDb(): Firestore | null {
  if (typeof window === "undefined") return null;
  if (cachedDb) return cachedDb;
  const app = getFirebaseApp();
  if (!app) return null;
  try {
    // Persistent local cache: repeat visits and reloads are served from IndexedDB
    // and listeners resume from a cached snapshot, so far less data is downloaded.
    cachedDb = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    cachedDb = getFirestore(app);
  }
  return cachedDb;
}


/* -------------------------------------------------------------------------- */
/*  Path resolution — must match the operator portal's src/lib/firestore.ts.   */
/*                                                                            */
/*  Rules (docs/FIRESTORE_MIGRATION_HANDOVER.md §2):                          */
/*   1. A declared collection prefix is a Firestore collection; the next       */
/*      segment is a document id and anything deeper is a nested field path    */
/*      inside that document (same semantics as the old RTDB subtree).         */
/*   2. Firestore collection paths need an odd segment count — when a logical   */
/*      collection path is even-length, the container document `_` is inserted  */
/*      before its final segment (promotions/codes → promotions/_/codes).      */
/* -------------------------------------------------------------------------- */

/** `*` matches exactly one dynamic segment. Order does not matter (longest wins). */
const COLLECTION_PREFIXES: string[][] = [
  ["restaurants"],
  ["restaurantBranches"],
  ["orders"],
  ["drivers"],
  ["driverAssignments"],
  ["staffUsers"],
  ["staffAudit"],
  ["restaurantUsers"],
  ["restaurantUserAudit"],
  ["menus", "*", "categories"],
  ["menus", "*", "items"],
  ["menus", "*", "variants"],
  ["menus", "*", "addons"],
  ["menus", "*", "modifiers"],
  ["promotions"],
  ["promotions", "codes"],
  ["promotions", "combos"],
  ["promotions", "restaurant_points"],
  ["notificationAlerts"],
  ["notificationTriggers"],
  ["notificationReads"],
  ["notificationAudit"],
  ["settings"],
  ["settingsAudit"],
  ["support", "tickets"],
  ["support", "messages"],
  ["uploads", "images"],
  ["loyalty", "wallets"],
  ["loyalty", "ledger"],
  ["loyalty", "earned_orders"],
  // Customer-app owned nodes (not portal-declared, listed here so their deeper
  // segments behave as nested fields exactly like every other prefix).
  ["customerAddresses"],
  ["customers"],
  ["branchMenuAvailability"],
];

type FsTarget =
  | { kind: "doc"; path: string; inject?: Record<string, unknown> }
  | { kind: "collection"; path: string }
  | { kind: "collectionQuery"; path: string; field: string; equals: string }
  | { kind: "field"; path: string; field: string };

/** Number of leading segments consumed by the longest matching collection prefix. */
function matchPrefixLength(segs: string[]): number {
  let best = 0;
  for (const prefix of COLLECTION_PREFIXES) {
    if (prefix.length > segs.length || prefix.length <= best) continue;
    const ok = prefix.every((part, i) => part === "*" || part === segs[i]);
    if (ok) best = prefix.length;
  }
  return best;
}

/** Even-length logical collection paths get the `_` container document. */
function toCollectionPath(prefixSegs: string[]): string {
  if (prefixSegs.length % 2 === 1) return prefixSegs.join("/");
  const head = prefixSegs.slice(0, -1);
  return [...head, "_", prefixSegs[prefixSegs.length - 1]!].join("/");
}

export function resolveTarget(rawPath: string): FsTarget {
  const p = rawPath.replace(/^\/+|\/+$/g, "");
  const segs = p.split("/").filter(Boolean);

  const prefixLength = matchPrefixLength(segs);
  if (prefixLength > 0) {
    const collectionPath = toCollectionPath(segs.slice(0, prefixLength));
    const rest = segs.slice(prefixLength);
    if (rest.length === 0) return { kind: "collection", path: collectionPath };
    if (rest.length === 1) return { kind: "doc", path: `${collectionPath}/${rest[0]}` };
    return {
      kind: "field",
      path: `${collectionPath}/${rest[0]}`,
      field: rest.slice(1).join("."),
    };
  }

  // Undeclared paths: even segment count → document, odd → collection.
  return segs.length % 2 === 0
    ? { kind: "doc", path: p }
    : { kind: "collection", path: toCollectionPath(segs) };
}

/** Firestore rejects `undefined`; the RTDB layer tolerated it. Strip it deeply. */
function sanitize<T>(value: T): T {
  if (value === undefined) return null as T;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (val === undefined) continue;
    out[key] = sanitize(val);
  }
  return out as T;
}

/** Reads a possibly nested ("a.b.c") field out of a document payload. */
function readField(data: Record<string, unknown> | undefined, field: string): unknown {
  if (!data) return null;
  let cursor: unknown = data;
  for (const key of field.split(".")) {
    if (!cursor || typeof cursor !== "object") return null;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor ?? null;
}

/** Builds `{ a: { b: value } }` for a nested field write (merge-safe). */
function nestField(field: string, value: unknown): Record<string, unknown> {
  const keys = field.split(".");
  return keys.reduceRight<unknown>((acc, key) => ({ [key]: acc }), value) as Record<
    string,
    unknown
  >;
}

function docRef(db: Firestore, target: { path: string }): DocumentReference {
  const parts = target.path.split("/");
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid document path: "${target.path}"`);
  }
  return doc(db, parts[0], parts[1], ...parts.slice(2));
}

function collRef(
  db: Firestore,
  target: Extract<FsTarget, { kind: "collection" | "collectionQuery" }>,
): CollectionReference {
  const parts = target.path.split("/");
  if (parts.length < 1 || !parts[0]) {
    throw new Error(`Invalid collection path: "${target.path}"`);
  }
  return collection(db, parts[0], ...parts.slice(1));
}

/**
 * Resolves a logical path to a Firestore document reference plus the nested
 * field it points at (if any). Exported for `runTransaction` call sites.
 */
export function fsDocRef(path: string): { ref: DocumentReference; field: string | null } | null {
  const db = getDb();
  if (!db) return null;
  const target = resolveTarget(path);
  if (target.kind === "doc") return { ref: docRef(db, target), field: null };
  if (target.kind === "field") return { ref: docRef(db, target), field: target.field };
  return null;
}

async function readTarget(target: FsTarget): Promise<FirestoreValue> {
  const db = getDb();
  if (!db) return null;

  if (target.kind === "doc") {
    const snap = await getDoc(docRef(db, target));
    return snap.exists() ? snap.data() : null;
  }
  if (target.kind === "field") {
    const snap = await getDoc(docRef(db, target));
    return snap.exists() ? readField(snap.data(), target.field) : null;
  }
  const base = collRef(db, target);
  const q =
    target.kind === "collectionQuery"
      ? query(base, where(target.field, "==", target.equals))
      : query(base, limit(400));
  const snaps = await getDocs(q);
  const record: Record<string, unknown> = {};
  snaps.forEach((d) => {
    if (d.id === "_") return;
    record[d.id] = d.data();
  });
  return record;
}

async function writeTarget(target: FsTarget, value: unknown): Promise<void> {
  const db = getDb();
  if (!db) return;

  const clean = sanitize(value);

  if (target.kind === "field") {
    await setDoc(docRef(db, target), nestField(target.field, clean), { merge: true });
    return;
  }
  if (target.kind === "doc") {
    await setDoc(docRef(db, target), { ...(target.inject ?? {}), ...(clean as object) });
    return;
  }

  // Map nodes: replace the whole keyed record with one batched write.
  const entries = Object.entries((clean ?? {}) as Record<string, unknown>);
  const base = collRef(db, target);
  let batch = writeBatch(db);
  let ops = 0;
  for (const [id, item] of entries) {
    batch.set(doc(base, id), (item ?? {}) as object);
    ops += 1;
    if (ops === 450) {
      await batch.commit();
      batch = writeBatch(db);
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
}

export async function fsGet<T = FirestoreValue>(path: string): Promise<T | null> {
  const db = getDb();
  if (!db) return null;
  try {
    const value = ((await readTarget(resolveTarget(path))) as T) ?? null;
    perfRecordRead(path, value);
    return value;
  } catch (error) {
    console.warn(`[firestore] get failed for "${path}":`, error);
    return null;
  }
}

export async function fsSet<T = unknown>(path: string, value: T): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await writeTarget(resolveTarget(path), value);
  } catch (error) {
    console.error(`[firestore] set failed for "${path}":`, error);
    throw error;
  }
}

export async function fsUpdate(path: string, values: Record<string, unknown>): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    const target = resolveTarget(path);
    if (target.kind === "doc") {
      await setDoc(docRef(db, target), sanitize(values), { merge: true });
      return;
    }
    if (target.kind === "field") {
      // Merge each provided key underneath the nested field path.
      await setDoc(docRef(db, target), nestField(target.field, sanitize(values)), { merge: true });
      return;
    }
    await writeTarget(target, values);
  } catch (error) {
    console.error(`[firestore] update failed for "${path}":`, error);
    throw error;
  }
}

/** Auto-id document inside a logical collection. Returns the new id. */
export async function fsPush(path: string, value: unknown): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const target = resolveTarget(path);
  if (target.kind !== "collection" && target.kind !== "collectionQuery") {
    throw new Error(`fsPush requires a collection path, got "${path}"`);
  }
  const created = await addDoc(collRef(db, target), sanitize(value) as object);
  return created.id;
}

export async function fsRemove(path: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    const target = resolveTarget(path);
    if (target.kind === "doc") {
      await deleteDoc(docRef(db, target));
      return;
    }
    if (target.kind === "field") {
      await setDoc(docRef(db, target), nestField(target.field, null), { merge: true });
      return;
    }
    throw new Error(`fsRemove does not support ${target.kind} targets`);
  } catch (error) {
    console.error(`[firestore] remove failed for "${path}":`, error);
    throw error;
  }
}

export function subscribeTarget(
  target: FsTarget,
  onData: (value: FirestoreValue) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const db = getDb() as Firestore;

  if (target.kind === "doc") {
    return onSnapshot(
      docRef(db, target),
      (snap) => onData(snap.exists() ? snap.data() : null),
      (error) => onError(error),
    );
  }
  if (target.kind === "field") {
    return onSnapshot(
      docRef(db, target),
      (snap) => onData(snap.exists() ? readField(snap.data(), target.field) : null),
      (error) => onError(error),
    );
  }
  const base = collRef(db, target);
  const q =
    target.kind === "collectionQuery"
      ? query(base, where(target.field, "==", target.equals))
      : query(base, limit(400));
  return onSnapshot(
    q,
    (snaps) => {
      const record: Record<string, unknown> = {};
      snaps.forEach((d) => {
        if (d.id === "_") return;
        record[d.id] = d.data();
      });
      onData(record);
    },
    (error) => onError(error),
  );
}

export function fsSubscribe<T = FirestoreValue>(
  path: string,
  callback: (data: T | null) => void,
): () => void {
  const db = getDb();
  if (!db) {
    callback(null);
    return () => {};
  }
  const closePerf = perfListenerOpened(path);
  const unsubscribe = subscribeTarget(
    resolveTarget(path),
    (data) => {
      perfRecordSnapshot(path, data);
      callback(data as T);
    },
    (error) => {
      console.warn(`[firestore] subscribe failed for "${path}":`, error.message);
      callback(null);
    },
  );
  return () => {
    closePerf();
    unsubscribe();
  };
}

/**
 * Subscribes to a *filtered* slice of a logical collection, so the client only
 * downloads the documents it actually needs (e.g. one customer's orders).
 */
export function fsSubscribeWhere<T = FirestoreValue>(
  path: string,
  field: string,
  equals: string,
  callback: (data: Record<string, T> | null) => void,
  max = 100,
): () => void {
  const db = getDb();
  if (!db) {
    callback(null);
    return () => {};
  }
  const target = resolveTarget(path);
  if (target.kind !== "collection") {
    callback(null);
    return () => {};
  }
  const base = collRef(db, target);
  const label = `${path}?${field}=${equals}`;
  const closePerf = perfListenerOpened(label);
  const unsubscribe = onSnapshot(
    query(base, where(field, "==", equals), limit(max)),
    (snaps) => {
      const record: Record<string, T> = {};
      snaps.forEach((d) => {
        if (d.id === "_") return;
        record[d.id] = d.data() as T;
      });
      perfRecordSnapshot(label, record);
      callback(record);
    },
    (error) => {
      console.warn(`[firestore] filtered subscribe failed for "${path}":`, error.message);
      callback(null);
    },
  );
  return () => {
    closePerf();
    unsubscribe();
  };
}


/* ------------------------ legacy names (same impl) ------------------------- */

export const rtdbGet = fsGet;
export const rtdbSet = fsSet;
export const rtdbUpdate = fsUpdate;
export const rtdbRemove = fsRemove;
export const rtdbSubscribe = fsSubscribe;

/* -------------------------------------------------------------------------- */
/*  Root subscription ("/"): assembles the portal's canonical collections      */
/*  into the JSON-tree shape the discovery/adapter layer reads.                */
/* -------------------------------------------------------------------------- */

/** Menus are fetched once per restaurant per session and reused. */
const menuCache = new Map<string, Record<string, Record<string, unknown>>>();
const menuFetches = new Set<string>();

const MENU_SUBCOLLECTIONS = ["items", "categories", "variants", "addons"] as const;

export function subscribeRoot(
  cb: (snapshot: { data: FirestoreValue; error: Error | null }) => void,
): () => void {
  const db = getDb();
  if (!db) {
    cb({ data: null, error: new Error("Firestore unavailable") });
    return () => {};
  }

  const state: Record<string, Record<string, unknown>> = {};
  /** menus[restaurantId][subcollection] = Record<id, doc> */
  const menus: Record<string, Record<string, Record<string, unknown>>> = {};
  const stops = new Map<string, () => void>();
  let restaurantsReady = false;
  let lastError: Error | null = null;

  const combined = () => ({
    restaurants: state["restaurants"] ?? {},
    menus,
    // Branch maps live as fields on restaurantBranches/{restaurantId}.
    restaurantBranches: state["restaurantBranches"] ?? {},
    promotions: {
      codes: state["promotions_codes"] ?? {},
      combos: state["promotions_combos"] ?? {},
      global: { points_config: state["points_config"] ?? {} },
      restaurant_points: state["promotions_restaurant_points"] ?? {},
    },
  });

  const emit = () => {
    if (!restaurantsReady) return;
    cb({ data: combined(), error: lastError });
  };

  const listenCollection = (key: string, logicalPath: string, onRecord?: () => void) => {
    const stop = fsSubscribe<Record<string, unknown>>(logicalPath, (record) => {
      state[key] = record && typeof record === "object" ? record : {};
      onRecord?.();
      emit();
    });
    stops.set(key, stop);
  };

  // Per-restaurant menus (menus/{rid}/items, …) are fetched once instead of
  // being live-listened: menus are large and rarely change mid-session, so a
  // single cached read per restaurant keeps data usage low.
  const fetchMenus = () => {
    const raw = state["restaurants"] ?? {};
    const ids = Object.keys(raw).filter((rid) => {
      const doc = raw[rid] as Record<string, unknown> | undefined;
      const status = typeof doc?.["status"] === "string" ? String(doc["status"]).toLowerCase() : "";
      return !status || /approved|active|live|published/.test(status);
    });

    for (const rid of ids) {
      const cached = menuCache.get(rid);
      if (cached) {
        menus[rid] = cached;
        continue;
      }
      if (menuFetches.has(rid)) continue;
      menuFetches.add(rid);
      void Promise.all(
        MENU_SUBCOLLECTIONS.map(async (sub) => {
          const record = await fsGet<Record<string, unknown>>(`menus/${rid}/${sub}`);
          return [sub, record && typeof record === "object" ? record : {}] as const;
        }),
      ).then((entries) => {
        const bundle = Object.fromEntries(entries) as Record<string, Record<string, unknown>>;
        menuCache.set(rid, bundle);
        menus[rid] = bundle;
        emit();
      });
    }
    emit();
  };


  listenCollection("restaurants", "restaurants", () => {
    restaurantsReady = true;
    fetchMenus();
  });
  listenCollection("restaurantBranches", "restaurantBranches");
  listenCollection("promotions_codes", "promotions/codes");
  listenCollection("promotions_combos", "promotions/combos");
  listenCollection("promotions_restaurant_points", "promotions/restaurant_points");

  // promotions/global/points_config is a field on the promotions/global document.
  const stopPoints = fsSubscribe<Record<string, unknown>>(
    "promotions/global/points_config",
    (value) => {
      state["points_config"] = value && typeof value === "object" ? value : {};
      emit();
    },
  );
  stops.set("points_config", stopPoints);

  // Never leave the UI hanging if Firestore is slow/unreachable.
  const bootstrapTimer = setTimeout(() => {
    if (!restaurantsReady) {
      restaurantsReady = true;
      lastError = null;
      emit();
    }
  }, 4000);

  return () => {
    clearTimeout(bootstrapTimer);
    stops.forEach((stop) => stop());
    stops.clear();
  };
}
