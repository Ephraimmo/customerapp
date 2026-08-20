import { useEffect, useMemo, useRef, useState } from "react";
import { getDb, onValue, ref } from "./firebase";

/** Anything Firebase can hand back. */
export type FirebaseValue = unknown;
export type FirebaseRecord = Record<string, unknown>;

const CACHE_PREFIX = "hearth.fb.cache.e-comm-bd997.v1:";

function readCache<T>(path: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + path);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeCache(path: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_PREFIX + path, JSON.stringify(value ?? null));
  } catch {
    /* quota or private mode — cache is best effort */
  }
}

type Listener = {
  subscribers: Set<(snapshot: { data: FirebaseValue; error: Error | null }) => void>;
  detach: () => void;
  last: { data: FirebaseValue; error: Error | null } | null;
};

/** One Firebase listener per path, shared by every hook instance. */
const listeners = new Map<string, Listener>();

function subscribe(
  path: string,
  cb: (snapshot: { data: FirebaseValue; error: Error | null }) => void,
): () => void {
  let entry = listeners.get(path);

  if (!entry) {
    const db = getDb();
    if (!db) return () => {};
    const created: Listener = {
      subscribers: new Set(),
      detach: () => {},
      last: null,
    };
    const unsubscribe = onValue(
      ref(db, path),
      (snap) => {
        const payload = { data: snap.val() as FirebaseValue, error: null };
        created.last = payload;
        writeCache(path, payload.data);
        created.subscribers.forEach((fn) => fn(payload));
      },
      (error) => {
        // Missing or restricted node: keep the app alive with an empty state.
        console.warn(`[firebase] listener failed for "${path}"`, error.message);
        const payload = { data: null as FirebaseValue, error: error as Error };
        created.last = payload;
        created.subscribers.forEach((fn) => fn(payload));
      },
    );
    created.detach = unsubscribe;
    listeners.set(path, created);
    entry = created;
  }

  entry.subscribers.add(cb);
  if (entry.last) cb(entry.last);

  return () => {
    const current = listeners.get(path);
    if (!current) return;
    current.subscribers.delete(cb);
    if (current.subscribers.size === 0) {
      current.detach();
      listeners.delete(path);
    }
  };
}

export type LiveResult<T> = {
  data: T | null;
  loading: boolean;
  error: Error | null;
  /** "cache" while offline / before the first snapshot, "live" once Firebase answers. */
  source: "cache" | "live" | "none";
};

/** Subscribes to a Firebase node, hydrating instantly from the offline cache. */
export function useFirebaseValue<T = FirebaseValue>(path: string, enabled = true): LiveResult<T> {
  // Start empty so SSR and the first client render match; the cache is read in
  // the effect below (post-hydration) to avoid hydration mismatches.
  const [state, setState] = useState<LiveResult<T>>({
    data: null,
    loading: enabled,
    error: null,
    source: "none",
  });

  const pathRef = useRef(path);
  pathRef.current = path;

  useEffect(() => {
    if (!enabled) return;
    const cached = readCache<T>(path);
    setState((prev) => ({
      data: prev.data ?? cached,
      loading: true,
      error: null,
      source: (prev.data ?? cached) === null ? "none" : "cache",
    }));

    return subscribe(path, ({ data, error }) => {
      setState((prev) => {
        if (error) {
          return { data: prev.data, loading: false, error, source: prev.source };
        }
        return { data: data as T, loading: false, error: null, source: "live" };
      });
    });
  }, [path, enabled]);

  return state;
}

/** Normalizes a Firebase node (push-key map or array) into an id-stamped list. */
export function toList<T extends FirebaseRecord = FirebaseRecord>(
  value: FirebaseValue,
): Array<T & { id: string }> {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item, index) =>
        item && typeof item === "object"
          ? ({ id: String(index), ...(item as FirebaseRecord) } as T & { id: string })
          : null,
      )
      .filter(Boolean) as Array<T & { id: string }>;
  }
  if (typeof value !== "object") return [];
  return Object.entries(value as FirebaseRecord)
    .filter(([, item]) => item && typeof item === "object" && !Array.isArray(item))
    .map(([key, item]) => ({ id: key, ...(item as FirebaseRecord) }) as T & { id: string });
}

/** Subscribes to a node and returns it as a normalized list. */
export function useFirebaseList<T extends FirebaseRecord = FirebaseRecord>(
  path: string,
  enabled = true,
) {
  const result = useFirebaseValue<FirebaseValue>(path, enabled);
  const items = useMemo(() => toList<T>(result.data), [result.data]);
  return { ...result, items };
}
