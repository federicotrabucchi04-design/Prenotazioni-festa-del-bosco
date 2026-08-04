import { getFirebaseDb } from "@/lib/firebase";
import { createId } from "@/lib/constants";
import { ref, remove, set, update } from "firebase/database";

const QUEUE_KEY = "fdb-offline-write-queue-v1";

export type QueuedWrite =
  | { id: string; op: "set"; path: string; value: unknown; at: number }
  | {
      id: string;
      op: "update";
      path: string;
      value: Record<string, unknown>;
      at: number;
    }
  | { id: string; op: "remove"; path: string; at: number };

type OnlineListener = (online: boolean) => void;
type QueueListener = (pending: number) => void;

const onlineListeners = new Set<OnlineListener>();
const queueListeners = new Set<QueueListener>();
let started = false;
let flushing = false;
let retryTimer: ReturnType<typeof setInterval> | null = null;

/** Firebase-safe: niente undefined */
function sanitize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

export function subscribeOnlineStatus(listener: OnlineListener): () => void {
  onlineListeners.add(listener);
  listener(getOnline());
  return () => onlineListeners.delete(listener);
}

export function subscribeOfflineQueue(listener: QueueListener): () => void {
  queueListeners.add(listener);
  listener(pendingOfflineWrites());
  return () => queueListeners.delete(listener);
}

function emitOnline() {
  const online = getOnline();
  onlineListeners.forEach((l) => l(online));
}

function emitQueue() {
  const n = pendingOfflineWrites();
  queueListeners.forEach((l) => l(n));
}

function readQueue(): QueuedWrite[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedWrite[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedWrite[]): boolean {
  if (typeof window === "undefined") return true;
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    emitQueue();
    return true;
  } catch {
    // Quota / private mode: non perdere silenziosamente — tenta compressione
    try {
      const trimmed = queue.slice(-40);
      localStorage.setItem(QUEUE_KEY, JSON.stringify(trimmed));
      emitQueue();
      return true;
    } catch {
      emitQueue();
      return false;
    }
  }
}

export function pendingOfflineWrites(): number {
  return readQueue().length;
}

/** True se c’è scrittura in coda per path esatto o antenato/discendente. */
export function hasPendingWriteForPath(path: string): boolean {
  return readQueue().some((q) => {
    if (q.path === path) return true;
    if (q.path.startsWith(`${path}/`)) return true;
    if (path.startsWith(`${q.path}/`)) return true;
    return false;
  });
}

/** Svuota la coda (es. prima di un restore). */
export function clearOfflineQueue(): void {
  writeQueue([]);
}

function enqueue(
  entry:
    | { op: "set"; path: string; value: unknown; at?: number }
    | { op: "update"; path: string; value: Record<string, unknown>; at?: number }
    | { op: "remove"; path: string; at?: number },
): boolean {
  const queue = readQueue();
  const path = entry.path;
  const prevForPath = queue.filter((q) => q.path === path);
  const kept = queue.filter((q) => q.path !== path);

  if (entry.op === "remove") {
    kept.push({
      id: createId(),
      op: "remove",
      path,
      at: entry.at ?? Date.now(),
    });
    return writeQueue(kept);
  }

  if (entry.op === "set") {
    kept.push({
      id: createId(),
      op: "set",
      path,
      value: entry.value,
      at: entry.at ?? Date.now(),
    });
    return writeQueue(kept);
  }

  // update: fondi con set/update precedenti sullo stesso path
  const updateValue = entry.value;
  const prevSet = prevForPath.find((q) => q.op === "set");
  if (prevSet && prevSet.op === "set" && prevSet.value && typeof prevSet.value === "object") {
    kept.push({
      id: createId(),
      op: "set",
      path,
      value: sanitize({
        ...(prevSet.value as Record<string, unknown>),
        ...updateValue,
      }),
      at: Date.now(),
    });
    return writeQueue(kept);
  }

  const prevUpdate = prevForPath.find((q) => q.op === "update");
  const merged = sanitize({
    ...(prevUpdate && prevUpdate.op === "update" ? prevUpdate.value : {}),
    ...updateValue,
  }) as Record<string, unknown>;

  kept.push({
    id: createId(),
    op: "update",
    path,
    value: merged,
    at: entry.at ?? Date.now(),
  });
  return writeQueue(kept);
}

export type WriteResult = "synced" | "queued";

export async function offlineSet(
  path: string,
  value: unknown,
): Promise<WriteResult> {
  const clean = sanitize(value);
  if (!getOnline()) {
    if (!enqueue({ op: "set", path, value: clean })) {
      throw new Error("Memoria piena: modifica non salvata. Libera spazio e riprova.");
    }
    return "queued";
  }
  const db = getFirebaseDb();
  if (!db) {
    if (!enqueue({ op: "set", path, value: clean })) {
      throw new Error("Memoria piena: modifica non salvata.");
    }
    return "queued";
  }
  try {
    await set(ref(db, path), clean);
    return "synced";
  } catch {
    if (!enqueue({ op: "set", path, value: clean })) {
      throw new Error("Rete assente e memoria piena: modifica a rischio.");
    }
    return "queued";
  }
}

export async function offlineUpdate(
  path: string,
  value: Record<string, unknown>,
): Promise<WriteResult> {
  const clean = sanitize(value) as Record<string, unknown>;
  if (!getOnline()) {
    if (!enqueue({ op: "update", path, value: clean })) {
      throw new Error("Memoria piena: modifica non salvata. Libera spazio e riprova.");
    }
    return "queued";
  }
  const db = getFirebaseDb();
  if (!db) {
    if (!enqueue({ op: "update", path, value: clean })) {
      throw new Error("Memoria piena: modifica non salvata.");
    }
    return "queued";
  }
  try {
    await update(ref(db, path), clean);
    return "synced";
  } catch {
    if (!enqueue({ op: "update", path, value: clean })) {
      throw new Error("Rete assente e memoria piena: modifica a rischio.");
    }
    return "queued";
  }
}

export async function offlineRemove(path: string): Promise<WriteResult> {
  if (!getOnline()) {
    if (!enqueue({ op: "remove", path })) {
      throw new Error("Memoria piena: modifica non salvata.");
    }
    return "queued";
  }
  const db = getFirebaseDb();
  if (!db) {
    if (!enqueue({ op: "remove", path })) {
      throw new Error("Memoria piena: modifica non salvata.");
    }
    return "queued";
  }
  try {
    await remove(ref(db, path));
    return "synced";
  } catch {
    if (!enqueue({ op: "remove", path })) {
      throw new Error("Rete assente e memoria piena: modifica a rischio.");
    }
    return "queued";
  }
}

/**
 * Svuota la coda in modo sicuro: dopo ogni await rilegge localStorage,
 * così enqueue durante il flush non viene sovrascritto.
 */
export async function flushOfflineQueue(): Promise<number> {
  if (!getOnline() || flushing) return 0;
  const db = getFirebaseDb();
  if (!db) return 0;

  flushing = true;
  let synced = 0;
  try {
    while (getOnline()) {
      const queue = readQueue();
      if (queue.length === 0) break;
      const item = queue[0]!;
      try {
        if (item.op === "set") {
          await set(ref(db, item.path), item.value);
        } else if (item.op === "update") {
          await update(ref(db, item.path), item.value);
        } else {
          await remove(ref(db, item.path));
        }
        const after = readQueue();
        if (after[0]?.id === item.id) {
          writeQueue(after.slice(1));
        } else {
          writeQueue(after.filter((q) => q.id !== item.id));
        }
        synced += 1;
      } catch {
        break;
      }
    }
  } finally {
    flushing = false;
  }
  return synced;
}

/** Avvia listener online/offline + retry periodico (anche se “online” ma Firebase fallisce). */
export function startOfflineSync(onFlushed?: (count: number) => void): () => void {
  if (typeof window === "undefined") return () => {};

  const onOnline = () => {
    emitOnline();
    void flushOfflineQueue().then((n) => {
      if (n > 0) onFlushed?.(n);
    });
  };
  const onOffline = () => emitOnline();

  if (!started) {
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    started = true;
  }

  if (retryTimer) clearInterval(retryTimer);
  retryTimer = setInterval(() => {
    if (!getOnline() || pendingOfflineWrites() === 0) return;
    void flushOfflineQueue().then((n) => {
      if (n > 0) onFlushed?.(n);
    });
  }, 12_000);

  // Visibility: quando torni sulla tab, riprova subito
  const onVis = () => {
    if (document.visibilityState === "visible") onOnline();
  };
  document.addEventListener("visibilitychange", onVis);

  void flushOfflineQueue().then((n) => {
    if (n > 0) onFlushed?.(n);
  });
  emitOnline();
  emitQueue();

  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVis);
    if (retryTimer) {
      clearInterval(retryTimer);
      retryTimer = null;
    }
    started = false;
  };
}
