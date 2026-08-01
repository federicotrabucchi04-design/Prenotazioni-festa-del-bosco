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

const onlineListeners = new Set<OnlineListener>();
let started = false;
let flushing = false;

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

function emitOnline() {
  const online = getOnline();
  onlineListeners.forEach((l) => l(online));
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

function writeQueue(queue: QueuedWrite[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function pendingOfflineWrites(): number {
  return readQueue().length;
}

function enqueue(
  entry:
    | { op: "set"; path: string; value: unknown; at?: number }
    | { op: "update"; path: string; value: Record<string, unknown>; at?: number }
    | { op: "remove"; path: string; at?: number },
) {
  const queue = readQueue();
  const path = entry.path;
  const kept = queue.filter((q) => q.path !== path);

  if (entry.op === "update") {
    const updateValue = entry.value;
    const prevSet = queue.find((q) => q.path === path && q.op === "set");
    if (
      prevSet &&
      prevSet.op === "set" &&
      prevSet.value &&
      typeof prevSet.value === "object"
    ) {
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
      writeQueue(kept);
      return;
    }
    kept.push({
      id: createId(),
      op: "update",
      path,
      value: updateValue,
      at: entry.at ?? Date.now(),
    });
    writeQueue(kept);
    return;
  }

  if (entry.op === "set") {
    kept.push({
      id: createId(),
      op: "set",
      path,
      value: entry.value,
      at: entry.at ?? Date.now(),
    });
    writeQueue(kept);
    return;
  }

  kept.push({
    id: createId(),
    op: "remove",
    path,
    at: entry.at ?? Date.now(),
  });
  writeQueue(kept);
}

export type WriteResult = "synced" | "queued";

export async function offlineSet(
  path: string,
  value: unknown,
): Promise<WriteResult> {
  const clean = sanitize(value);
  if (!getOnline()) {
    enqueue({ op: "set", path, value: clean });
    return "queued";
  }
  const db = getFirebaseDb();
  if (!db) {
    enqueue({ op: "set", path, value: clean });
    return "queued";
  }
  try {
    await set(ref(db, path), clean);
    return "synced";
  } catch {
    enqueue({ op: "set", path, value: clean });
    return "queued";
  }
}

export async function offlineUpdate(
  path: string,
  value: Record<string, unknown>,
): Promise<WriteResult> {
  const clean = sanitize(value) as Record<string, unknown>;
  if (!getOnline()) {
    enqueue({ op: "update", path, value: clean });
    return "queued";
  }
  const db = getFirebaseDb();
  if (!db) {
    enqueue({ op: "update", path, value: clean });
    return "queued";
  }
  try {
    await update(ref(db, path), clean);
    return "synced";
  } catch {
    enqueue({ op: "update", path, value: clean });
    return "queued";
  }
}

export async function offlineRemove(path: string): Promise<WriteResult> {
  if (!getOnline()) {
    enqueue({ op: "remove", path });
    return "queued";
  }
  const db = getFirebaseDb();
  if (!db) {
    enqueue({ op: "remove", path });
    return "queued";
  }
  try {
    await remove(ref(db, path));
    return "synced";
  } catch {
    enqueue({ op: "remove", path });
    return "queued";
  }
}

export async function flushOfflineQueue(): Promise<number> {
  if (!getOnline() || flushing) return 0;
  const db = getFirebaseDb();
  if (!db) return 0;

  flushing = true;
  let synced = 0;
  try {
    let queue = readQueue();
    while (queue.length > 0) {
      const item = queue[0]!;
      try {
        if (item.op === "set") {
          await set(ref(db, item.path), item.value);
        } else if (item.op === "update") {
          await update(ref(db, item.path), item.value);
        } else {
          await remove(ref(db, item.path));
        }
        queue = queue.slice(1);
        writeQueue(queue);
        synced += 1;
      } catch {
        // Rete ancora instabile: riprova al prossimo online
        break;
      }
    }
  } finally {
    flushing = false;
  }
  return synced;
}

/** Avvia listener online/offline e svuota la coda al riconnetto. */
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

  // Tentativo iniziale
  void flushOfflineQueue().then((n) => {
    if (n > 0) onFlushed?.(n);
  });
  emitOnline();

  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    started = false;
  };
}
