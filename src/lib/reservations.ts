import type { Reservation, ReservationInput } from "@/lib/types";
import { EVENT_DATE, calcTotal, createId } from "@/lib/constants";
import { getFirebaseDb, isFirebaseConfigured } from "@/lib/firebase";
import { checkTableCapacity } from "@/lib/layout-utils";
import { subscribeLayout } from "@/lib/layout";
import type { VenueLayout } from "@/lib/types";
import { createDefaultLayout } from "@/lib/layout-utils";
import {
  ensureEveningsReady,
  getActiveEveningId,
  readDemoStore,
  writeDemoStore,
  resetDemoEvenings,
} from "@/lib/evenings";
import { scheduleBackupAfterChange } from "@/lib/backup";
import { offlineRemove, offlineSet, offlineUpdate } from "@/lib/offline-sync";
import { get, onValue, ref } from "firebase/database";

type Listener = (items: Reservation[]) => void;

const RES_CACHE_KEY = "fdb-res-cache-v1";

const listeners = new Set<Listener>();
let cachedLayout: VenueLayout = createDefaultLayout();
let cachedActiveEveningId: string | null = null;
let firebaseUnsubReservations: (() => void) | null = null;
let firebaseUnsubActive: (() => void) | null = null;

// Keep a live layout cache for capacity checks
if (typeof window !== "undefined") {
  subscribeLayout((layout) => {
    cachedLayout = layout;
  });
}

export function getCachedLayout() {
  return cachedLayout;
}

function notify(items: Reservation[]) {
  listeners.forEach((l) => l(items));
}

function normalizeRecord(
  id: string,
  value: Partial<Reservation> | null,
): Reservation | null {
  if (!value || !value.name) return null;
  const adults = Number(value.adults ?? 0);
  const children = Number(value.children ?? 0);
  return {
    id,
    name: String(value.name),
    phone: String(value.phone ?? ""),
    adults,
    children,
    total: Number(value.total ?? calcTotal(adults, children)),
    notes: String(value.notes ?? ""),
    zone: String(value.zone ?? ""),
    tableNumber: Number(value.tableNumber ?? 0),
    arrived: Boolean(value.arrived),
    date: String(value.date ?? EVENT_DATE),
    updatedAt: Number(value.updatedAt ?? Date.now()),
  };
}

function sortReservations(items: Reservation[]) {
  return [...items].sort((a, b) => {
    const aUnassigned = !a.tableNumber;
    const bUnassigned = !b.tableNumber;
    if (aUnassigned !== bUnassigned) return aUnassigned ? -1 : 1;
    if (a.arrived !== b.arrived) return a.arrived ? 1 : -1;
    return a.name.localeCompare(b.name, "it");
  });
}

export function getDataMode(): "firebase" | "demo" {
  return isFirebaseConfigured() ? "firebase" : "demo";
}

function readDemoReservations(): Reservation[] {
  const store = readDemoStore();
  const id = store.activeEveningId;
  return store.reservations[id] ?? [];
}

function writeDemoReservations(items: Reservation[]) {
  const store = readDemoStore();
  const id = store.activeEveningId;
  writeDemoStore({
    ...store,
    reservations: {
      ...store.reservations,
      [id]: items,
    },
  });
  notify(sortReservations(items));
}

function readResCache(eveningId: string): Reservation[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(RES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      eveningId?: string;
      items?: Partial<Reservation>[];
    };
    if (parsed.eveningId !== eveningId || !Array.isArray(parsed.items)) {
      return null;
    }
    return sortReservations(
      parsed.items
        .map((v, i) => normalizeRecord(String(v.id || `tmp_${i}`), v))
        .filter(Boolean) as Reservation[],
    );
  } catch {
    return null;
  }
}

function writeResCache(eveningId: string, items: Reservation[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      RES_CACHE_KEY,
      JSON.stringify({ eveningId, items, at: Date.now() }),
    );
  } catch {
    // ignore
  }
}

function attachFirebaseReservations(eveningId: string) {
  const db = getFirebaseDb();
  if (!db) {
    notify(readResCache(eveningId) ?? []);
    return;
  }
  firebaseUnsubReservations?.();
  cachedActiveEveningId = eveningId;

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    notify(readResCache(eveningId) ?? []);
  }

  const path = `eveningReservations/${eveningId}`;
  firebaseUnsubReservations = onValue(
    ref(db, path),
    (snapshot) => {
      const val = snapshot.val() as Record<string, Partial<Reservation>> | null;
      const items: Reservation[] = [];
      if (val) {
        for (const [id, row] of Object.entries(val)) {
          const normalized = normalizeRecord(id, row);
          if (normalized) items.push(normalized);
        }
      }
      const sorted = sortReservations(items);
      writeResCache(eveningId, sorted);
      notify(sorted);
    },
    () => notify(readResCache(eveningId) ?? []),
  );
}

export function subscribeReservations(listener: Listener): () => void {
  listeners.add(listener);

  if (getDataMode() === "demo") {
    listener(sortReservations(readDemoReservations()));
    return () => listeners.delete(listener);
  }

  const db = getFirebaseDb();
  if (!db) {
    listener([]);
    return () => listeners.delete(listener);
  }

  // Prima sottoscrizione: avvia migrazione + ascolto activeEveningId
  if (!firebaseUnsubActive) {
    void ensureEveningsReady().then(() => {
      if (!getFirebaseDb()) return;
      firebaseUnsubActive = onValue(ref(db, "activeEveningId"), (snap) => {
        const id = snap.exists() ? String(snap.val()) : null;
        if (!id) {
          cachedActiveEveningId = null;
          notify([]);
          return;
        }
        if (id !== cachedActiveEveningId) {
          attachFirebaseReservations(id);
        }
      });
    });
  } else if (cachedActiveEveningId) {
    // Nuovo listener: rileggi subito lo stato corrente
    void loadAllReservations().then((items) => listener(sortReservations(items)));
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      firebaseUnsubReservations?.();
      firebaseUnsubReservations = null;
      firebaseUnsubActive?.();
      firebaseUnsubActive = null;
      cachedActiveEveningId = null;
    }
  };
}

async function loadAllReservations(): Promise<Reservation[]> {
  await ensureEveningsReady();
  if (getDataMode() === "demo") return readDemoReservations();
  const eveningId = cachedActiveEveningId ?? (await getActiveEveningId());
  if (!eveningId) return readResCache("") ?? [];

  const cached = readResCache(eveningId);
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return cached ?? [];
  }

  const db = getFirebaseDb();
  if (!db) return cached ?? [];
  try {
    const snap = await get(ref(db, `eveningReservations/${eveningId}`));
    if (!snap.exists()) return cached ?? [];
    const rows = snap.val() as Record<string, Partial<Reservation>>;
    const items = Object.entries(rows)
      .map(([id, row]) => normalizeRecord(id, row))
      .filter((r): r is Reservation => Boolean(r));
    const sorted = sortReservations(items);
    writeResCache(eveningId, sorted);
    return sorted;
  } catch {
    return cached ?? [];
  }
}

function toPayload(input: ReservationInput) {
  const adults = Math.max(0, Number(input.adults) || 0);
  const children = Math.max(0, Number(input.children) || 0);
  return {
    name: input.name.trim(),
    phone: input.phone.trim(),
    adults,
    children,
    total: calcTotal(adults, children),
    notes: input.notes?.trim() ?? "",
    zone: input.zone,
    tableNumber: Number(input.tableNumber) || 0,
    arrived: Boolean(input.arrived),
    date: input.date,
    updatedAt: Date.now(),
  };
}

export class CapacityExceededError extends Error {
  check: ReturnType<typeof checkTableCapacity>;
  constructor(check: ReturnType<typeof checkTableCapacity>) {
    super(
      `Il tavolo supera il limite (max ${check.capacity}+${check.softLimit - check.capacity}). Totale previsto: ${check.proposedTotal}.`,
    );
    this.name = "CapacityExceededError";
    this.check = check;
  }
}

export async function upsertReservation(input: ReservationInput) {
  const payload = toPayload(input);
  if (!payload.name) throw new Error("Il nome è obbligatorio");
  if (!payload.zone) payload.zone = "";

  if (payload.tableNumber > 0) {
    if (!payload.zone) throw new Error("La zona è obbligatoria per assegnare un tavolo");

    const all = await loadAllReservations();
    const check = checkTableCapacity({
      layout: cachedLayout,
      reservations: all,
      zone: payload.zone,
      tableNumber: payload.tableNumber,
      incomingPeople: payload.total,
      excludeReservationId: input.id,
    });

    if (!check.ok && !input.allowOverCapacity) {
      throw new CapacityExceededError(check);
    }
  } else {
    payload.tableNumber = 0;
  }

  if (getDataMode() === "demo") {
    const items = readDemoReservations();
    if (input.id) {
      const idx = items.findIndex((r) => r.id === input.id);
      if (idx === -1) throw new Error("Prenotazione non trovata");
      items[idx] = { ...items[idx]!, ...payload, id: input.id };
    } else {
      items.push({ ...payload, id: createId() });
    }
    writeDemoReservations(items);
    scheduleBackupAfterChange();
    return;
  }

  await ensureEveningsReady();
  const eveningId = cachedActiveEveningId ?? (await getActiveEveningId());
  if (!eveningId) throw new Error("Nessuna serata attiva");

  const id = input.id || createId();
  const record = { ...payload, id } as Reservation;
  const cached = readResCache(eveningId) ?? (await loadAllReservations());
  const next = input.id
    ? cached.map((r) => (r.id === id ? { ...r, ...record } : r))
    : [...cached.filter((r) => r.id !== id), record];
  const sorted = sortReservations(next);
  writeResCache(eveningId, sorted);
  notify(sorted);

  const path = `eveningReservations/${eveningId}/${id}`;
  if (input.id) {
    await offlineUpdate(path, payload);
  } else {
    await offlineSet(path, payload);
  }
  scheduleBackupAfterChange();
}

export async function deleteReservation(id: string) {
  if (getDataMode() === "demo") {
    writeDemoReservations(readDemoReservations().filter((r) => r.id !== id));
    scheduleBackupAfterChange();
    return;
  }
  await ensureEveningsReady();
  const eveningId = cachedActiveEveningId ?? (await getActiveEveningId());
  if (!eveningId) throw new Error("Nessuna serata attiva");

  const cached = readResCache(eveningId) ?? (await loadAllReservations());
  const sorted = sortReservations(cached.filter((r) => r.id !== id));
  writeResCache(eveningId, sorted);
  notify(sorted);

  await offlineRemove(`eveningReservations/${eveningId}/${id}`);
  scheduleBackupAfterChange();
}

export async function setArrived(id: string, arrived: boolean) {
  if (getDataMode() === "demo") {
    const items = readDemoReservations().map((r) =>
      r.id === id ? { ...r, arrived, updatedAt: Date.now() } : r,
    );
    writeDemoReservations(items);
    scheduleBackupAfterChange();
    return;
  }
  await ensureEveningsReady();
  const eveningId = cachedActiveEveningId ?? (await getActiveEveningId());
  if (!eveningId) throw new Error("Nessuna serata attiva");

  const patch = { arrived, updatedAt: Date.now() };
  const cached = readResCache(eveningId) ?? (await loadAllReservations());
  const sorted = sortReservations(
    cached.map((r) => (r.id === id ? { ...r, ...patch } : r)),
  );
  writeResCache(eveningId, sorted);
  notify(sorted);

  await offlineUpdate(`eveningReservations/${eveningId}/${id}`, patch);
  scheduleBackupAfterChange();
}

export function resetDemoData() {
  resetDemoEvenings();
  notify(sortReservations(readDemoReservations()));
}

/** Dopo cambio serata: aggiorna lista prenotazioni (demo + force re-read). */
export function refreshReservationListeners() {
  if (getDataMode() === "demo") {
    notify(sortReservations(readDemoReservations()));
    return;
  }
  // Firebase: se activeEveningId è già in cache, riattacca il listener
  if (cachedActiveEveningId) {
    attachFirebaseReservations(cachedActiveEveningId);
  }
}
