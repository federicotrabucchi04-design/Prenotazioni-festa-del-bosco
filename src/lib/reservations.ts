import type { Reservation, ReservationInput } from "@/lib/types";
import {
  DEMO_STORAGE_KEY,
  SEED_RESERVATIONS,
  calcTotal,
  createId,
  EVENT_DATE,
} from "@/lib/constants";
import { getFirebaseDb, isFirebaseConfigured } from "@/lib/firebase";
import { checkTableCapacity } from "@/lib/layout-utils";
import { subscribeLayout } from "@/lib/layout";
import type { VenueLayout } from "@/lib/types";
import { createDefaultLayout } from "@/lib/layout-utils";
import { get, onValue, push, ref, remove, set, update } from "firebase/database";

type Listener = (items: Reservation[]) => void;

const listeners = new Set<Listener>();
let cachedLayout: VenueLayout = createDefaultLayout();

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

function readDemo(): Reservation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) {
      const seeded = SEED_RESERVATIONS.map((r) => ({
        ...r,
        id: createId(),
        updatedAt: Date.now(),
      }));
      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    return JSON.parse(raw) as Reservation[];
  } catch {
    return [];
  }
}

function writeDemo(items: Reservation[]) {
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(items));
  notify(items);
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
    if (a.arrived !== b.arrived) return a.arrived ? 1 : -1;
    return a.name.localeCompare(b.name, "it");
  });
}

export function getDataMode(): "firebase" | "demo" {
  return isFirebaseConfigured() ? "firebase" : "demo";
}

export function subscribeReservations(listener: Listener): () => void {
  if (getDataMode() === "demo") {
    listeners.add(listener);
    listener(sortReservations(readDemo()));
    return () => listeners.delete(listener);
  }

  const db = getFirebaseDb();
  if (!db) {
    listeners.add(listener);
    listener([]);
    return () => listeners.delete(listener);
  }

  const reservationsRef = ref(db, "reservations");
  return onValue(
    reservationsRef,
    (snapshot) => {
      const val = snapshot.val() as Record<string, Partial<Reservation>> | null;
      const items: Reservation[] = [];
      if (val) {
        for (const [id, row] of Object.entries(val)) {
          const normalized = normalizeRecord(id, row);
          if (normalized) items.push(normalized);
        }
      }
      listener(sortReservations(items));
    },
    () => listener([]),
  );
}

async function loadAllReservations(): Promise<Reservation[]> {
  if (getDataMode() === "demo") return readDemo();
  const db = getFirebaseDb();
  if (!db) return [];
  const snap = await get(ref(db, "reservations"));
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
  if (!payload.zone) throw new Error("La zona è obbligatoria");
  if (!payload.tableNumber) throw new Error("Il numero tavolo è obbligatorio");

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

  if (getDataMode() === "demo") {
    const items = readDemo();
    if (input.id) {
      const idx = items.findIndex((r) => r.id === input.id);
      if (idx === -1) throw new Error("Prenotazione non trovata");
      items[idx] = { ...items[idx]!, ...payload, id: input.id };
    } else {
      items.push({ ...payload, id: createId() });
    }
    writeDemo(items);
    return;
  }

  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase non configurato");

  if (input.id) {
    await update(ref(db, `reservations/${input.id}`), payload);
  } else {
    const newRef = push(ref(db, "reservations"));
    await set(newRef, payload);
  }
}

export async function deleteReservation(id: string) {
  if (getDataMode() === "demo") {
    writeDemo(readDemo().filter((r) => r.id !== id));
    return;
  }
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase non configurato");
  await remove(ref(db, `reservations/${id}`));
}

export async function setArrived(id: string, arrived: boolean) {
  if (getDataMode() === "demo") {
    const items = readDemo().map((r) =>
      r.id === id ? { ...r, arrived, updatedAt: Date.now() } : r,
    );
    writeDemo(items);
    return;
  }
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase non configurato");
  await update(ref(db, `reservations/${id}`), {
    arrived,
    updatedAt: Date.now(),
  });
}

export function resetDemoData() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(DEMO_STORAGE_KEY);
  notify(sortReservations(readDemo()));
}
