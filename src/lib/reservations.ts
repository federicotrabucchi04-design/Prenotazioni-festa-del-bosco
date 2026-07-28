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
import { get, onValue, push, ref, remove, set, update } from "firebase/database";

type Listener = (items: Reservation[]) => void;

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

function attachFirebaseReservations(eveningId: string) {
  const db = getFirebaseDb();
  if (!db) {
    notify([]);
    return;
  }
  firebaseUnsubReservations?.();
  cachedActiveEveningId = eveningId;
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
      notify(sortReservations(items));
    },
    () => notify([]),
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
  const db = getFirebaseDb();
  if (!db) return [];
  const eveningId = cachedActiveEveningId ?? (await getActiveEveningId());
  if (!eveningId) return [];
  const snap = await get(ref(db, `eveningReservations/${eveningId}`));
  if (!snap.exists()) return [];
  const rows = snap.val() as Record<string, Partial<Reservation>>;
  return Object.entries(rows)
    .map(([id, row]) => normalizeRecord(id, row))
    .filter((r): r is Reservation => Boolean(r));
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

  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase non configurato");
  await ensureEveningsReady();
  const eveningId = cachedActiveEveningId ?? (await getActiveEveningId());
  if (!eveningId) throw new Error("Nessuna serata attiva");

  if (input.id) {
    await update(ref(db, `eveningReservations/${eveningId}/${input.id}`), payload);
  } else {
    const newRef = push(ref(db, `eveningReservations/${eveningId}`));
    await set(newRef, payload);
  }
  scheduleBackupAfterChange();
}

export async function deleteReservation(id: string) {
  if (getDataMode() === "demo") {
    writeDemoReservations(readDemoReservations().filter((r) => r.id !== id));
    scheduleBackupAfterChange();
    return;
  }
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase non configurato");
  await ensureEveningsReady();
  const eveningId = cachedActiveEveningId ?? (await getActiveEveningId());
  if (!eveningId) throw new Error("Nessuna serata attiva");
  await remove(ref(db, `eveningReservations/${eveningId}/${id}`));
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
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase non configurato");
  await ensureEveningsReady();
  const eveningId = cachedActiveEveningId ?? (await getActiveEveningId());
  if (!eveningId) throw new Error("Nessuna serata attiva");
  await update(ref(db, `eveningReservations/${eveningId}/${id}`), {
    arrived,
    updatedAt: Date.now(),
  });
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
