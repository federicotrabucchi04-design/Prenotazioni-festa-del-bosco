import { getFirebaseDb, isFirebaseConfigured } from "@/lib/firebase";
import { createId } from "@/lib/constants";
import {
  onDisconnect,
  onValue,
  ref,
  remove,
  serverTimestamp,
  set,
  update,
} from "firebase/database";

export const SCHERMO_PRESENCE_PATH = "orderPresence/schermo";
const DEMO_KEY = "fdb-schermo-presence-demo";
const CHANNEL = "fdb-schermo-presence";

/** Se non arriva heartbeat entro questo tempo → considerato offline */
export const SCHERMO_STALE_MS = 45_000;
const HEARTBEAT_MS = 15_000;

export type SchermoPresence = {
  online: boolean;
  /** Timestamp ultimo segnale (ms), 0 se mai visto */
  at: number;
};

type Listener = (state: SchermoPresence) => void;

const listeners = new Set<Listener>();
let current: SchermoPresence = { online: false, at: 0 };
let subscribed = false;
let unsubRemote: (() => void) | null = null;
let staleTimer: ReturnType<typeof setInterval> | null = null;

function emit(next: SchermoPresence) {
  current = next;
  for (const l of listeners) l(next);
}

function sessionAt(v: unknown): number {
  if (!v || typeof v !== "object") return 0;
  const at = (v as { at?: unknown }).at;
  if (typeof at === "number" && Number.isFinite(at)) return at;
  if (typeof at === "string") {
    const n = Number(at);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function recomputeFromSessions(
  sessions: Record<string, unknown> | null,
) {
  const now = Date.now();
  let latest = 0;
  if (sessions) {
    for (const v of Object.values(sessions)) {
      const at = sessionAt(v);
      if (at > latest) latest = at;
    }
  }
  const online = latest > 0 && now - latest < SCHERMO_STALE_MS;
  emit({ online, at: latest });
}

function ensureSubscribe() {
  if (subscribed || typeof window === "undefined") return;
  subscribed = true;

  staleTimer = setInterval(() => {
    if (current.at > 0) {
      const online = Date.now() - current.at < SCHERMO_STALE_MS;
      if (online !== current.online) emit({ ...current, online });
    }
  }, 5_000);

  if (!isFirebaseConfigured()) {
    const readDemo = () => {
      try {
        const raw = localStorage.getItem(DEMO_KEY);
        if (!raw) {
          emit({ online: false, at: 0 });
          return;
        }
        const parsed = JSON.parse(raw) as Record<
          string,
          { at?: number } | null
        >;
        recomputeFromSessions(parsed);
      } catch {
        emit({ online: false, at: 0 });
      }
    };
    readDemo();
    const onStorage = (e: StorageEvent) => {
      if (e.key === DEMO_KEY) readDemo();
    };
    window.addEventListener("storage", onStorage);
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(CHANNEL);
      bc.onmessage = () => readDemo();
    } catch {
      /* ignore */
    }
    unsubRemote = () => {
      window.removeEventListener("storage", onStorage);
      bc?.close();
    };
    return;
  }

  const db = getFirebaseDb();
  if (!db) return;
  const root = ref(db, SCHERMO_PRESENCE_PATH);
  unsubRemote = onValue(root, (snap) => {
    const val = snap.val() as Record<string, { at?: number } | null> | null;
    recomputeFromSessions(val);
  });
}

export function getSchermoPresence(): SchermoPresence {
  return current;
}

export function subscribeSchermoPresence(listener: Listener): () => void {
  ensureSubscribe();
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}

function writeDemoSession(sessionId: string, at: number | null) {
  let map: Record<string, { at: number }> = {};
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    if (raw) map = JSON.parse(raw) as Record<string, { at: number }>;
  } catch {
    map = {};
  }
  if (at == null) delete map[sessionId];
  else map[sessionId] = { at };
  localStorage.setItem(DEMO_KEY, JSON.stringify(map));
  try {
    new BroadcastChannel(CHANNEL).postMessage("tick");
  } catch {
    /* ignore */
  }
  recomputeFromSessions(map);
}

/**
 * Pubblica presenza Schermo finché il componente è montato.
 * Restituisce cleanup (smette heartbeat + rimuove sessione).
 */
export function startSchermoPresence(): () => void {
  if (typeof window === "undefined") return () => undefined;

  const sessionId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : createId();

  let stopped = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let unsubConnected: (() => void) | null = null;

  const beat = async () => {
    if (stopped) return;
    const at = Date.now();

    if (!isFirebaseConfigured()) {
      writeDemoSession(sessionId, at);
      return;
    }

    const db = getFirebaseDb();
    if (!db) return;
    const sessionRef = ref(db, `${SCHERMO_PRESENCE_PATH}/${sessionId}`);
    try {
      await update(sessionRef, { at });
    } catch {
      try {
        await set(sessionRef, { at });
      } catch {
        /* ignore */
      }
    }
  };

  if (!isFirebaseConfigured()) {
    void beat();
    heartbeat = setInterval(() => void beat(), HEARTBEAT_MS);
    return () => {
      stopped = true;
      if (heartbeat) clearInterval(heartbeat);
      writeDemoSession(sessionId, null);
    };
  }

  const db = getFirebaseDb();
  if (!db) return () => undefined;

  const sessionRef = ref(db, `${SCHERMO_PRESENCE_PATH}/${sessionId}`);
  const connectedRef = ref(db, ".info/connected");

  unsubConnected = onValue(connectedRef, (snap) => {
    if (snap.val() !== true || stopped) return;
    void (async () => {
      try {
        await onDisconnect(sessionRef).remove();
        await set(sessionRef, { at: serverTimestamp() });
        // serverTimestamp → number dopo sync; subito anche un at locale
        await update(sessionRef, { at: Date.now() });
      } catch {
        /* ignore */
      }
    })();
  });

  void beat();
  heartbeat = setInterval(() => void beat(), HEARTBEAT_MS);

  return () => {
    stopped = true;
    if (heartbeat) clearInterval(heartbeat);
    unsubConnected?.();
    void remove(sessionRef).catch(() => undefined);
  };
}
