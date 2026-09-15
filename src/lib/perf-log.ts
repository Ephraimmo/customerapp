/**
 * Load-performance instrumentation for the Firestore data layer.
 *
 * Tracks, per logical path: one-off reads, live listeners (open / currently
 * active / peak), snapshot deliveries, document counts and an estimated
 * download size (JSON byte length of every payload handed to the app).
 *
 * Zero-cost in production unless explicitly switched on:
 *   - always on in dev (`import.meta.env.DEV`)
 *   - opt in anywhere with `?perf=1` in the URL or
 *     `localStorage.setItem("hearth.perf", "1")` then reload
 *
 * Inspect at any time from the browser console:
 *   __hearthPerf.summary()   // totals + per-path table
 *   __hearthPerf.reset()
 */

type PathStats = {
  path: string;
  reads: number;
  listeners: number;
  activeListeners: number;
  peakListeners: number;
  snapshots: number;
  docs: number;
  bytes: number;
};

export type PerfSummary = {
  msSinceStart: number;
  totals: {
    reads: number;
    listeners: number;
    activeListeners: number;
    peakListeners: number;
    snapshots: number;
    docs: number;
    bytes: number;
    kb: number;
  };
  paths: PathStats[];
};

const START = typeof performance !== "undefined" ? performance.now() : 0;

function detectEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("perf") === "1") return true;
    if (window.localStorage.getItem("hearth.perf") === "1") return true;
  } catch {
    /* storage blocked */
  }
  return Boolean(import.meta.env.DEV);
}

let enabled = detectEnabled();

export function isPerfLoggingEnabled(): boolean {
  return enabled;
}

const stats = new Map<string, PathStats>();

function entry(path: string): PathStats {
  let found = stats.get(path);
  if (!found) {
    found = {
      path,
      reads: 0,
      listeners: 0,
      activeListeners: 0,
      peakListeners: 0,
      snapshots: 0,
      docs: 0,
      bytes: 0,
    };
    stats.set(path, found);
  }
  return found;
}

/** Rough transfer size: byte length of the payload the app receives. */
function sizeOf(value: unknown): { bytes: number; docs: number } {
  if (value === null || value === undefined) return { bytes: 0, docs: 0 };
  let json = "";
  try {
    json = JSON.stringify(value) ?? "";
  } catch {
    json = "";
  }
  const bytes =
    typeof TextEncoder !== "undefined" ? new TextEncoder().encode(json).length : json.length;
  const docs =
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.keys(value as Record<string, unknown>).length
      : 1;
  return { bytes, docs };
}

export function perfRecordRead(path: string, value: unknown): void {
  if (!enabled) return;
  const e = entry(path);
  const { bytes, docs } = sizeOf(value);
  e.reads += 1;
  e.bytes += bytes;
  e.docs += docs;
}

export function perfRecordSnapshot(path: string, value: unknown): void {
  if (!enabled) return;
  const e = entry(path);
  const { bytes, docs } = sizeOf(value);
  e.snapshots += 1;
  e.bytes += bytes;
  e.docs += docs;
}

/** Call when a listener opens; returns the matching close callback. */
export function perfListenerOpened(path: string): () => void {
  if (!enabled) return () => {};
  const e = entry(path);
  e.listeners += 1;
  e.activeListeners += 1;
  e.peakListeners = Math.max(e.peakListeners, e.activeListeners);
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    e.activeListeners = Math.max(0, e.activeListeners - 1);
  };
}

export function perfSummary(): PerfSummary {
  const paths = [...stats.values()].sort((a, b) => b.bytes - a.bytes);
  const totals = paths.reduce(
    (acc, p) => ({
      reads: acc.reads + p.reads,
      listeners: acc.listeners + p.listeners,
      activeListeners: acc.activeListeners + p.activeListeners,
      peakListeners: acc.peakListeners + p.peakListeners,
      snapshots: acc.snapshots + p.snapshots,
      docs: acc.docs + p.docs,
      bytes: acc.bytes + p.bytes,
      kb: 0,
    }),
    {
      reads: 0,
      listeners: 0,
      activeListeners: 0,
      peakListeners: 0,
      snapshots: 0,
      docs: 0,
      bytes: 0,
      kb: 0,
    },
  );
  totals.kb = Math.round((totals.bytes / 1024) * 10) / 10;
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  return { msSinceStart: Math.round(now - START), totals, paths };
}

export function perfReset(): void {
  stats.clear();
}

function logSummary(label: string): void {
  const s = perfSummary();
  const { totals } = s;
  // eslint-disable-next-line no-console
  console.info(
    `[perf] ${label} @${s.msSinceStart}ms — ${totals.kb} KB, ${totals.reads} reads, ` +
      `${totals.snapshots} snapshots, ${totals.docs} docs, ` +
      `${totals.activeListeners} active listeners (peak ${totals.peakListeners})`,
  );
  // eslint-disable-next-line no-console
  console.table?.(s.paths);
}

/** Installs the console handle and an automatic post-load summary. */
export function initPerfLogging(): void {
  if (typeof window === "undefined") return;
  enabled = detectEnabled();
  const api = {
    summary: () => {
      logSummary("summary");
      return perfSummary();
    },
    json: perfSummary,
    reset: perfReset,
    enable: () => {
      enabled = true;
      try {
        window.localStorage.setItem("hearth.perf", "1");
      } catch {
        /* ignore */
      }
    },
    disable: () => {
      enabled = false;
      try {
        window.localStorage.removeItem("hearth.perf");
      } catch {
        /* ignore */
      }
    },
  };
  (window as unknown as Record<string, unknown>)["__hearthPerf"] = api;
  if (!enabled) return;
  // One automatic snapshot of the initial load, once things have settled.
  window.setTimeout(() => logSummary("initial load"), 6000);
}
