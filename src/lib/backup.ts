import type { Evening, Reservation, VenueLayout } from "@/lib/types";
import { createId } from "@/lib/constants";
import { getFirebaseDb, isFirebaseConfigured } from "@/lib/firebase";
import { get, ref, remove, set, update } from "firebase/database";
import { readDemoStore } from "@/lib/evenings";
import { getCachedLayout } from "@/lib/reservations";

export const BACKUPS_PATH = "dataBackups";
export const LOCAL_BACKUPS_KEY = "fdb-local-backups-v1";
export const BACKUP_META_KEY = "fdb-backup-meta-v1";

/** Intervallo backup automatico (salta se identico al precedente) */
export const AUTO_BACKUP_INTERVAL_MS = 3 * 60 * 1000;
/** Debounce dopo ogni modifica prenotazioni */
export const BACKUP_DEBOUNCE_MS = 15_000;
/** Max copie sul dispositivo (le più vecchie si cancellano) */
export const MAX_LOCAL_BACKUPS = 10;
/** Max copie su Firebase */
export const MAX_REMOTE_BACKUPS = 20;

export type BackupSource = "auto" | "manual" | "change";

export interface BackupSnapshot {
  id: string;
  createdAt: number;
  source: BackupSource;
  activeEveningId: string | null;
  evenings: Record<string, Evening>;
  /** Prenotazioni per serata: eveningId → id → record */
  eveningReservations: Record<string, Record<string, Reservation>>;
  venueLayout: VenueLayout | null;
  reservationCount: number;
  version: 1;
}

export interface BackupMeta {
  lastBackupAt: number;
  lastBackupId: string | null;
  lastSource: BackupSource | null;
  lastError: string | null;
  /** Ultimo controllo automatico (anche se saltato perché identico) */
  lastCheckedAt: number;
  lastSkippedIdentical: boolean;
}

type MetaListener = (meta: BackupMeta) => void;
const metaListeners = new Set<MetaListener>();

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let intervalTimer: ReturnType<typeof setInterval> | null = null;
let running = false;

function dataMode(): "firebase" | "demo" {
  return isFirebaseConfigured() ? "firebase" : "demo";
}

function emptyMeta(): BackupMeta {
  return {
    lastBackupAt: 0,
    lastBackupId: null,
    lastSource: null,
    lastError: null,
    lastCheckedAt: 0,
    lastSkippedIdentical: false,
  };
}

/** Confronta solo i dati utili (ignora id/data/source del backup). */
function sameBackupContent(a: BackupSnapshot, b: BackupSnapshot): boolean {
  if (a.reservationCount !== b.reservationCount) return false;
  if (a.activeEveningId !== b.activeEveningId) return false;
  try {
    return (
      JSON.stringify(a.eveningReservations) ===
        JSON.stringify(b.eveningReservations) &&
      JSON.stringify(a.evenings) === JSON.stringify(b.evenings) &&
      JSON.stringify(a.venueLayout) === JSON.stringify(b.venueLayout)
    );
  } catch {
    return false;
  }
}

export function getBackupMeta(): BackupMeta {
  if (typeof window === "undefined") return emptyMeta();
  try {
    const raw = localStorage.getItem(BACKUP_META_KEY);
    if (!raw) return emptyMeta();
    return { ...emptyMeta(), ...(JSON.parse(raw) as BackupMeta) };
  } catch {
    return emptyMeta();
  }
}

function writeMeta(meta: BackupMeta) {
  if (typeof window === "undefined") return;
  localStorage.setItem(BACKUP_META_KEY, JSON.stringify(meta));
  metaListeners.forEach((l) => l(meta));
}

export function subscribeBackupMeta(listener: MetaListener): () => void {
  metaListeners.add(listener);
  listener(getBackupMeta());
  return () => metaListeners.delete(listener);
}

function reservationsToMap(items: Reservation[]): Record<string, Reservation> {
  const out: Record<string, Reservation> = {};
  for (const r of items) out[r.id] = r;
  return out;
}

function countReservations(
  eveningReservations: Record<string, Record<string, Reservation>>,
): number {
  let n = 0;
  for (const map of Object.values(eveningReservations)) {
    n += Object.keys(map).length;
  }
  return n;
}

async function collectSnapshot(source: BackupSource): Promise<BackupSnapshot> {
  const id = createId();
  const createdAt = Date.now();

  if (dataMode() === "demo") {
    const store = readDemoStore();
    const eveningReservations: Record<string, Record<string, Reservation>> = {};
    for (const [eid, list] of Object.entries(store.reservations)) {
      eveningReservations[eid] = reservationsToMap(list);
    }
    return {
      id,
      createdAt,
      source,
      activeEveningId: store.activeEveningId,
      evenings: { ...store.evenings },
      eveningReservations,
      venueLayout: getCachedLayout(),
      reservationCount: countReservations(eveningReservations),
      version: 1,
    };
  }

  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase non configurato");

  const [activeSnap, eveningsSnap, reservationsSnap, layoutSnap] =
    await Promise.all([
      get(ref(db, "activeEveningId")),
      get(ref(db, "evenings")),
      get(ref(db, "eveningReservations")),
      get(ref(db, "venueLayout")),
    ]);

  const evenings = (eveningsSnap.val() as Record<string, Evening> | null) ?? {};
  const eveningReservations =
    (reservationsSnap.val() as Record<
      string,
      Record<string, Reservation>
    > | null) ?? {};

  return {
    id,
    createdAt,
    source,
    activeEveningId: activeSnap.exists() ? String(activeSnap.val()) : null,
    evenings,
    eveningReservations,
    venueLayout: layoutSnap.exists()
      ? (layoutSnap.val() as VenueLayout)
      : getCachedLayout(),
    reservationCount: countReservations(eveningReservations),
    version: 1,
  };
}

function readLocalBackups(): BackupSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_BACKUPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BackupSnapshot[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalBackups(list: BackupSnapshot[]) {
  if (typeof window === "undefined") return;
  const trimmed = list
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_LOCAL_BACKUPS);
  localStorage.setItem(LOCAL_BACKUPS_KEY, JSON.stringify(trimmed));
}

async function pruneRemoteBackups() {
  const db = getFirebaseDb();
  if (!db) return;
  const snap = await get(ref(db, BACKUPS_PATH));
  if (!snap.exists()) return;
  const all = snap.val() as Record<string, BackupSnapshot>;
  const sorted = Object.values(all).sort((a, b) => b.createdAt - a.createdAt);
  const toRemove = sorted.slice(MAX_REMOTE_BACKUPS);
  await Promise.all(
    toRemove.map((b) => remove(ref(db, `${BACKUPS_PATH}/${b.id}`))),
  );
}

export async function createBackup(source: BackupSource = "manual") {
  if (running) return getBackupMeta();
  running = true;
  try {
    const snapshot = await collectSnapshot(source);
    const latest = readLocalBackups()[0];

    // Auto / dopo modifica: non salvare se identico → niente intasamento
    if (source !== "manual" && latest && sameBackupContent(latest, snapshot)) {
      writeMeta({
        ...getBackupMeta(),
        lastCheckedAt: Date.now(),
        lastSkippedIdentical: true,
        lastError: null,
      });
      return getBackupMeta();
    }

    // Sempre locale (anche con Firebase)
    const local = readLocalBackups().filter((b) => b.id !== snapshot.id);
    local.unshift(snapshot);
    writeLocalBackups(local);

    if (dataMode() === "firebase") {
      const db = getFirebaseDb();
      if (db) {
        await set(ref(db, `${BACKUPS_PATH}/${snapshot.id}`), snapshot);
        await pruneRemoteBackups();
      }
    }

    const meta: BackupMeta = {
      lastBackupAt: snapshot.createdAt,
      lastBackupId: snapshot.id,
      lastSource: source,
      lastError: null,
      lastCheckedAt: snapshot.createdAt,
      lastSkippedIdentical: false,
    };
    writeMeta(meta);
    return meta;
  } catch (err) {
    const meta: BackupMeta = {
      ...getBackupMeta(),
      lastError: err instanceof Error ? err.message : "Errore backup",
      lastCheckedAt: Date.now(),
    };
    writeMeta(meta);
    throw err;
  } finally {
    running = false;
  }
}

/** Dopo una modifica: backup ritardato (non spam) */
export function scheduleBackupAfterChange() {
  if (typeof window === "undefined") return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void createBackup("change").catch(() => {
      // best-effort
    });
  }, BACKUP_DEBOUNCE_MS);
}

export function startAutoBackup() {
  if (typeof window === "undefined") return () => {};
  stopAutoBackup();

  // Primo giro dopo pochi secondi
  const first = window.setTimeout(() => {
    void createBackup("auto").catch(() => {});
  }, 8_000);

  intervalTimer = setInterval(() => {
    void createBackup("auto").catch(() => {});
  }, AUTO_BACKUP_INTERVAL_MS);

  return () => {
    window.clearTimeout(first);
    stopAutoBackup();
  };
}

export function stopAutoBackup() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (intervalTimer) {
    clearInterval(intervalTimer);
    intervalTimer = null;
  }
}

export function listLocalBackups(): BackupSnapshot[] {
  return readLocalBackups();
}

export async function listRemoteBackups(): Promise<BackupSnapshot[]> {
  if (dataMode() === "demo") return readLocalBackups();
  const db = getFirebaseDb();
  if (!db) return readLocalBackups();
  const snap = await get(ref(db, BACKUPS_PATH));
  if (!snap.exists()) return readLocalBackups();
  const all = Object.values(snap.val() as Record<string, BackupSnapshot>);
  const byId = new Map<string, BackupSnapshot>();
  for (const b of [...readLocalBackups(), ...all]) byId.set(b.id, b);
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function downloadBackupJson(snapshot: BackupSnapshot) {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date(snapshot.createdAt)
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  a.href = url;
  a.download = `feste-bosco-backup-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadActiveEveningCsv(snapshot: BackupSnapshot) {
  const eveningId = snapshot.activeEveningId;
  if (!eveningId) throw new Error("Nessuna serata attiva nel backup");
  const rows = Object.values(snapshot.eveningReservations[eveningId] ?? {});
  const header = [
    "id",
    "name",
    "phone",
    "adults",
    "children",
    "total",
    "zone",
    "tableNumber",
    "arrived",
    "notes",
    "date",
  ];
  const escape = (v: string | number | boolean) => {
    const s = String(v ?? "");
    if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [
    header.join(";"),
    ...rows.map((r) =>
      [
        r.id,
        r.name,
        r.phone,
        r.adults,
        r.children,
        r.total,
        r.zone,
        r.tableNumber,
        r.arrived,
        r.notes,
        r.date,
      ]
        .map(escape)
        .join(";"),
    ),
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `feste-bosco-prenotati-${eveningId}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Ripristina prenotazioni (+ serate e layout) da uno snapshot.
 * Sovrascrive i dati attuali: usare solo se serve davvero.
 */
export async function restoreBackup(snapshot: BackupSnapshot) {
  if (
    !window.confirm(
      `Ripristinare il backup del ${new Date(snapshot.createdAt).toLocaleString("it-IT")}?\n` +
        `${snapshot.reservationCount} prenotazioni totali. I dati attuali verranno sostituiti.`,
    )
  ) {
    return false;
  }

  if (dataMode() === "demo") {
    const { writeDemoStore } = await import("@/lib/evenings");
    const reservations: Record<string, Reservation[]> = {};
    for (const [eid, map] of Object.entries(snapshot.eveningReservations)) {
      reservations[eid] = Object.values(map);
    }
    writeDemoStore({
      activeEveningId: snapshot.activeEveningId ?? Object.keys(snapshot.evenings)[0]!,
      evenings: snapshot.evenings,
      reservations,
      archives: readDemoStore().archives,
    });
    if (snapshot.venueLayout) {
      const { saveLayout } = await import("@/lib/layout");
      await saveLayout(snapshot.venueLayout);
    }
    const { refreshReservationListeners } = await import("@/lib/reservations");
    refreshReservationListeners();
    return true;
  }

  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase non configurato");

  const payload: Record<string, unknown> = {
    evenings: snapshot.evenings,
    eveningReservations: snapshot.eveningReservations,
    activeEveningId: snapshot.activeEveningId,
  };
  if (snapshot.venueLayout) payload.venueLayout = snapshot.venueLayout;
  await update(ref(db), payload);
  return true;
}

export function formatBackupWhen(at: number) {
  if (!at) return "mai";
  return new Date(at).toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
