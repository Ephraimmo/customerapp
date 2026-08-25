import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
  type CollectionReference,
  type DocumentReference,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";

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

export type RTDBValue = unknown;

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
      cachedApp = getApps()[0] || initializeApp(firebaseConfig);
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
  cachedDb = getFirestore(app);
  return cachedDb;
}

/* -------------------------------------------------------------------------- */
/*  Path resolution: legacy slash paths → Firestore documents/collections.    */
/*                                                                            */
/*  Every node the customer app reads or writes is mapped to an explicit      */
/*  Firestore location. Even-depth object paths map naturally; legacy         */
/*  "map" nodes (keyed records) are flattened into dedicated collections so   */
/*  subscriptions keep returning the same Record<id, value> payloads.         */
/* -------------------------------------------------------------------------- */

type FsTarget =
  | { kind: "doc"; path: string; inject?: Record<string, unknown> }
  | { kind: "collection"; path: string }
  | { kind: "collectionQuery"; path: string; field: string; equals: string }
  | { kind: "field"; path: string; field: string };

export function resolveTarget(rawPath: string): FsTarget {
  const p = rawPath.replace(/^\/+|\/+$/g, "");
  const segs = p.split("/").filter(Boolean);
  const [a, b, c] = segs;

  switch (a) {
    case "orders": {
      if (segs.length === 1) return { kind: "collection", path: "orders" };
      if (segs.length === 2 && b) return { kind: "doc", path: `orders/${b}` };
      if (!b || !c) break;
      if ((c === "items" || c === "timeline") && segs.length === 3)
        return { kind: "collection", path: `orders/${b}/${c}` };
      if ((c === "items" || c === "timeline") && segs.length === 4)
        return { kind: "doc", path: `orders/${b}/${c}/${segs[3]}` };
      if (c === "payment" && segs.length === 3)
        return { kind: "doc", path: `orders/${b}/payment/current` };
      if (c === "payment_status" && segs.length === 3)
        return { kind: "field", path: `orders/${b}`, field: "payment_status" };
      if (c === "promo_breakdown" && segs.length === 3)
        return { kind: "field", path: `orders/${b}`, field: "promo_breakdown" };
      break;
    }

    case "drivers": {
      // drivers/live/{orderId} → single live-location document
      if (b === "live" && segs.length === 3 && c) return { kind: "doc", path: `driver_live/${c}` };
      break;
    }

    case "support": {
      // support/messages/{ticketId}[/{messageId}] → messages subcollection
      if (a === "support" && b === "messages") {
        if (segs.length === 3 && c)
          return { kind: "collection", path: `support/tickets/${c}/messages` };
        if (segs.length === 4 && c)
          return { kind: "doc", path: `support/tickets/${c}/messages/${segs[3]}` };
      }
      break;
    }

    case "customerAddresses": {
      // Per-customer saved addresses, flattened with an owner_id field
      if (segs.length === 2 && b)
        return {
          kind: "collectionQuery",
          path: "customer_addresses",
          field: "owner_id",
          equals: b,
        };
      if (segs.length === 3 && b && c)
        return {
          kind: "doc",
          path: `customer_addresses/${c}`,
          inject: { owner_id: b },
        };
      if (segs.length === 4 && b && c)
        return { kind: "field", path: `customer_addresses/${c}`, field: String(segs[3]) };
      break;
    }

    case "loyalty": {
      if (b === "wallets" && segs.length === 3 && c)
        return { kind: "doc", path: `loyalty_wallets/${c}` };
      if (b === "earned_orders" && segs.length === 4 && c)
        return { kind: "doc", path: `loyalty_earned_orders/${c}__${segs[3]}` };
      if (b === "ledger" && segs.length === 3 && c)
        return { kind: "collectionQuery", path: "loyalty_ledger", field: "customer_id", equals: c };
      if (b === "ledger" && segs.length === 4 && c)
        return {
          kind: "doc",
          path: `loyalty_ledger/${segs[3]}`,
          inject: { customer_id: c },
        };
      break;
    }

    case "promotions": {
      if (p === "promotions/codes") return { kind: "collection", path: "promotions_codes" };
      if (p === "promotions/combos") return { kind: "collection", path: "promotions_combos" };
      if (p === "promotions/global/points_config")
        return { kind: "doc", path: "config/points_config" };
      if (p === "promotions/restaurant_points")
        return { kind: "collection", path: "promotion_restaurant_points" };
      break;
    }

    case "restaurants": {
      // restaurants/{rid}/payment_config → dedicated config collection
      if (segs.length === 3 && b && c === "payment_config")
        return { kind: "doc", path: `restaurant_payment_config/${b}` };
      break;
    }

    case "restaurantBranches": {
      // restaurantBranches/{rid} → branches collection filtered by restaurant_id
      if (segs.length === 2 && b)
        return {
          kind: "collectionQuery",
          path: "restaurant_branches",
          field: "restaurant_id",
          equals: b,
        };
      break;
    }

    case "branchMenuAvailability": {
      // branchMenuAvailability/{rid}/{bid} → composite-key overlay document
      if (segs.length === 3 && b && c)
        return { kind: "doc", path: `branch_menu_availability/${b}__${c}` };
      break;
    }

    default:
      break;
  }

  // Default mapping: even segment count → document, odd → subcollection.
  return segs.length % 2 === 0 ? { kind: "doc", path: p } : { kind: "collection", path: p };
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

async function readTarget(target: FsTarget): Promise<RTDBValue> {
  const db = getDb();
  if (!db) return null;

  if (target.kind === "doc") {
    const snap = await getDoc(docRef(db, target));
    return snap.exists() ? snap.data() : null;
  }
  if (target.kind === "field") {
    const snap = await getDoc(docRef(db, target));
    return snap.exists() ? (snap.data()[target.field] ?? null) : null;
  }
  const base = collRef(db, target);
  const q =
    target.kind === "collectionQuery"
      ? query(base, where(target.field, "==", target.equals))
      : query(base, limit(2000));
  const snaps = await getDocs(q);
  const record: Record<string, unknown> = {};
  snaps.forEach((d) => {
    record[d.id] = d.data();
  });
  return record;
}

async function writeTarget(target: FsTarget, value: unknown): Promise<void> {
  const db = getDb();
  if (!db) return;

  const clean = sanitize(value);

  if (target.kind === "field") {
    await setDoc(docRef(db, target), clean === null ? {} : { [target.field]: clean }, {
      merge: true,
    });
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

export async function rtdbGet<T = RTDBValue>(path: string): Promise<T | null> {
  const db = getDb();
  if (!db) return null;
  try {
    return ((await readTarget(resolveTarget(path))) as T) ?? null;
  } catch (error) {
    console.warn(`[firebase] rtdbGet failed for "${path}":`, error);
    return null;
  }
}

export async function rtdbSet<T = unknown>(path: string, value: T): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await writeTarget(resolveTarget(path), value);
  } catch (error) {
    console.error(`[firebase] rtdbSet failed for "${path}":`, error);
    throw error;
  }
}

export async function rtdbUpdate(path: string, values: Record<string, unknown>): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    const target = resolveTarget(path);
    if (target.kind === "doc") {
      await setDoc(docRef(db, target), sanitize(values), { merge: true });
      return;
    }
    if (target.kind === "field") {
      await setDoc(
        docRef(db, target),
        { [target.field]: sanitize(values[target.field]) },
        { merge: true },
      );
      return;
    }
    // Fallback for collection targets: merge-write every provided key.
    await writeTarget(target, values);
  } catch (error) {
    console.error(`[firebase] rtdbUpdate failed for "${path}":`, error);
    throw error;
  }
}

export async function rtdbRemove(path: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    const target = resolveTarget(path);
    if (target.kind === "doc") {
      await deleteDoc(docRef(db, target));
      return;
    }
    if (target.kind === "field") {
      await setDoc(docRef(db, target), {}, { merge: true });
      return;
    }
    throw new Error(`rtdbRemove does not support ${target.kind} targets`);
  } catch (error) {
    console.error(`[firebase] rtdbRemove failed for "${path}":`, error);
    throw error;
  }
}

export function subscribeTarget(
  target: FsTarget,
  onData: (value: RTDBValue) => void,
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
      (snap) => onData(snap.exists() ? (snap.data()[target.field] ?? null) : null),
      (error) => onError(error),
    );
  }
  const base = collRef(db, target);
  const q =
    target.kind === "collectionQuery"
      ? query(base, where(target.field, "==", target.equals))
      : query(base, limit(2000));
  return onSnapshot(
    q,
    (snaps) => {
      const record: Record<string, unknown> = {};
      snaps.forEach((d) => {
        record[d.id] = d.data();
      });
      onData(record);
    },
    (error) => onError(error),
  );
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
  const unsubscribe = subscribeTarget(
    resolveTarget(path),
    (data) => callback(data as T),
    (error) => {
      console.warn(`[firebase] rtdbSubscribe failed for "${path}":`, error.message);
      callback(null);
    },
  );
  return () => {
    unsubscribe();
  };
}

/* -------------------------------------------------------------------------- */
/*  Root subscription ("/"): assembles the canonical discovery collections    */
/*  into the same JSON-tree shape the schema discovery used to read.          */
/* -------------------------------------------------------------------------- */

function groupByField(record: Record<string, unknown>, field: string): Record<string, unknown> {
  const grouped: Record<string, Record<string, unknown>> = {};
  for (const [id, value] of Object.entries(record)) {
    const owner = String((value as Record<string, unknown>)?.[field] ?? "");
    grouped[owner] = grouped[owner] ?? {};
    grouped[owner][id] = value;
  }
  return grouped;
}

export function subscribeRoot(
  cb: (snapshot: { data: RTDBValue; error: Error | null }) => void,
): () => void {
  const db = getDb();
  if (!db) {
    cb({ data: null, error: new Error("Firestore unavailable") });
    return () => {};
  }

  const state: Record<string, Record<string, unknown>> = {};
  const stops: Array<() => void> = [];
  const expected = 9;
  let ready = 0;
  const emitted = false;

  const combined = () => ({
    restaurants: state["restaurants"] ?? {},
    menu_items: state["menu_items"] ?? {},
    menus: state["menus"] ?? {},
    categories: state["categories"] ?? {},
    promotions: {
      codes: state["promotions_codes"] ?? {},
      combos: state["promotions_combos"] ?? {},
      global: { points_config: state["points_config"] ?? {} },
      restaurant_points: state["promotion_restaurant_points"] ?? {},
    },
    restaurantBranches: groupByField(state["restaurant_branches"] ?? {}, "restaurant_id"),
  });

  const settle = (error: Error | null) => {
    ready += 1;
    if (ready < expected) return;
    cb({ data: combined(), error });
  };

  const listenCollection = (key: string, path: string) => {
    const stop = onSnapshot(
      query(collRef(db, { kind: "collection", path }), limit(2000)),
      (snaps) => {
        const record: Record<string, unknown> = {};
        snaps.forEach((d) => {
          record[d.id] = d.data();
        });
        state[key] = record;
        settle(null);
      },
      (error) => {
        console.warn(`[firebase] root listener failed for "${path}"`, error.message);
        settle(error);
      },
    );
    stops.push(() => stop());
  };

  const listenDoc = (key: string, path: string) => {
    const parts = path.split("/");
    const stop = onSnapshot(
      doc(db, parts[0]!, parts[1]!),
      (snap) => {
        state[key] = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
        settle(null);
      },
      (error) => {
        console.warn(`[firebase] root listener failed for "${path}"`, error.message);
        settle(error);
      },
    );
    stops.push(() => stop());
  };

  listenCollection("restaurants", "restaurants");
  listenCollection("menu_items", "menu_items");
  listenCollection("menus", "menus");
  listenCollection("categories", "categories");
  listenCollection("promotions_codes", "promotions_codes");
  listenCollection("promotions_combos", "promotions_combos");
  listenCollection("promotion_restaurant_points", "promotion_restaurant_points");
  listenCollection("restaurant_branches", "restaurant_branches");
  listenDoc("points_config", "config/points_config");

  return () => {
    stops.forEach((stop) => stop());
  };
}
