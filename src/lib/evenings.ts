import type { ArchiveSummary, Evening, Reservation } from "@/lib/types";
import {
  DEMO_EVENINGS_STORAGE_KEY,
  DEMO_STORAGE_KEY,
  EVENT_DATE,
  SEED_RESERVATIONS,
  createId,
} from "@/lib/constants";
import { getFirebaseDb, isFirebaseConfigured } from "@/lib/firebase";
import {
  get,
  onValue,
  ref,
  remove,
  set,
  update,
} from "firebase/database";

export interface DemoStore {
  activeEveningId: string;
  evenings: Record<string, Evening>;
  /** Prenotazioni per serata */
  reservations: Record<string, Reservation[]>;
  archives: Record<string, ArchiveSummary>;
}

type EveningsListener = (state: {
  active: Evening | null;
  evenings: Evening[];
  archives: ArchiveSummary[];
}) => void;

const eveningsListeners = new Set<EveningsListener>();
let demoStore: DemoStore | null = null;
let migrationPromise: Promise<void> | null = null;

function getDataMode(): "firebase" | "demo" {
  return isFirebaseConfigured() ? "firebase" : "demo";
}

function notifyEvenings() {
  const snapshot = getEveningsSnapshotSync();
  eveningsListeners.forEach((l) => l(snapshot));
}

function getEveningsSnapshotSync(): {
  active: Evening | null;
  evenings: Evening[];
  archives: ArchiveSummary[];
} {
  if (getDataMode() === "demo") {
    const store = readDemoStore();
    const evenings = Object.values(store.evenings).sort(
      (a, b) => b.createdAt - a.createdAt,
    );
    const active =
      evenings.find((e) => e.id === store.activeEveningId) ??
      evenings.find((e) => e.status === "active") ??
      null;
    const archives = Object.values(store.archives).sort(
      (a, b) => b.archivedAt - a.archivedAt,
    );
    return { active, evenings, archives };
  }
  // Firebase: sync snapshot is empty until subscribe fires; callers use async
  return { active: null, evenings: [], archives: [] };
}

function seedDemoStore(): DemoStore {
  const id = createId();
  const evening: Evening = {
    id,
    label: EVENT_DATE,
    status: "active",
    createdAt: Date.now(),
  };
  const reservations = SEED_RESERVATIONS.map((r) => ({
    ...r,
    id: createId(),
    updatedAt: Date.now(),
  }));
  return {
    activeEveningId: id,
    evenings: { [id]: evening },
    reservations: { [id]: reservations },
    archives: {},
  };
}

function migrateLegacyDemoReservations(): DemoStore | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return null;
    const items = JSON.parse(raw) as Reservation[];
    if (!Array.isArray(items) || items.length === 0) return null;
    const id = createId();
    const evening: Evening = {
      id,
      label: EVENT_DATE,
      status: "active",
      createdAt: Date.now(),
    };
    const store: DemoStore = {
      activeEveningId: id,
      evenings: { [id]: evening },
      reservations: { [id]: items },
      archives: {},
    };
    localStorage.setItem(DEMO_EVENINGS_STORAGE_KEY, JSON.stringify(store));
    localStorage.removeItem(DEMO_STORAGE_KEY);
    return store;
  } catch {
    return null;
  }
}

export function readDemoStore(): DemoStore {
  if (typeof window === "undefined") return seedDemoStore();
  if (demoStore) return demoStore;
  try {
    const raw = localStorage.getItem(DEMO_EVENINGS_STORAGE_KEY);
    if (raw) {
      demoStore = JSON.parse(raw) as DemoStore;
      return demoStore;
    }
  } catch {
    /* fall through */
  }
  const migrated = migrateLegacyDemoReservations();
  if (migrated) {
    demoStore = migrated;
    return demoStore;
  }
  demoStore = seedDemoStore();
  localStorage.setItem(DEMO_EVENINGS_STORAGE_KEY, JSON.stringify(demoStore));
  return demoStore;
}

export function writeDemoStore(store: DemoStore) {
  demoStore = store;
  if (typeof window !== "undefined") {
    localStorage.setItem(DEMO_EVENINGS_STORAGE_KEY, JSON.stringify(store));
  }
  notifyEvenings();
}

function normalizeEvening(
  id: string,
  value: Partial<Evening> | null,
): Evening | null {
  if (!value || !value.label) return null;
  return {
    id,
    label: String(value.label),
    status: value.status === "archived" ? "archived" : "active",
    createdAt: Number(value.createdAt ?? Date.now()),
  };
}

function normalizeArchive(
  eveningId: string,
  value: Partial<ArchiveSummary> | null,
): ArchiveSummary | null {
  if (!value) return null;
  return {
    eveningId,
    eveningLabel: String(value.eveningLabel ?? "Serata"),
    archivedAt: Number(value.archivedAt ?? Date.now()),
    totalPeopleBooked: Number(value.totalPeopleBooked ?? 0),
    reservationCount: Number(value.reservationCount ?? 0),
    arrivedPeopleCount: Number(value.arrivedPeopleCount ?? 0),
  };
}

export function buildArchiveSummary(
  evening: Evening,
  reservations: Reservation[],
): ArchiveSummary {
  let totalPeopleBooked = 0;
  let arrivedPeopleCount = 0;
  for (const r of reservations) {
    const people = Number(r.total) || 0;
    totalPeopleBooked += people;
    if (r.arrived) arrivedPeopleCount += people;
  }
  return {
    eveningId: evening.id,
    eveningLabel: evening.label,
    archivedAt: Date.now(),
    totalPeopleBooked,
    reservationCount: reservations.length,
    arrivedPeopleCount,
  };
}

/** Migra vecchio nodo flat `reservations` verso la prima serata attiva. */
async function ensureFirebaseMigrated(): Promise<void> {
  const db = getFirebaseDb();
  if (!db) return;

  const activeSnap = await get(ref(db, "activeEveningId"));
  if (activeSnap.exists() && typeof activeSnap.val() === "string") {
    // Già migrato: eventuali residui flat li spostiamo se la serata attiva è vuota
    const activeId = String(activeSnap.val());
    const legacy = await get(ref(db, "reservations"));
    if (!legacy.exists()) return;
    const scoped = await get(ref(db, `eveningReservations/${activeId}`));
    if (!scoped.exists()) {
      await set(ref(db, `eveningReservations/${activeId}`), legacy.val());
    }
    await remove(ref(db, "reservations"));
    return;
  }

  const id = createId();
  const evening: Evening = {
    id,
    label: EVENT_DATE,
    status: "active",
    createdAt: Date.now(),
  };
  await set(ref(db, `evenings/${id}`), {
    label: evening.label,
    status: evening.status,
    createdAt: evening.createdAt,
  });
  await set(ref(db, "activeEveningId"), id);

  const legacy = await get(ref(db, "reservations"));
  if (legacy.exists()) {
    await set(ref(db, `eveningReservations/${id}`), legacy.val());
    await remove(ref(db, "reservations"));
  }
}

export async function ensureEveningsReady(): Promise<void> {
  if (getDataMode() === "demo") {
    readDemoStore();
    return;
  }
  if (!migrationPromise) {
    migrationPromise = ensureFirebaseMigrated().catch((err) => {
      migrationPromise = null;
      throw err;
    });
  }
  await migrationPromise;
}

export async function getActiveEveningId(): Promise<string | null> {
  await ensureEveningsReady();
  if (getDataMode() === "demo") {
    return readDemoStore().activeEveningId || null;
  }
  const db = getFirebaseDb();
  if (!db) return null;
  const snap = await get(ref(db, "activeEveningId"));
  return snap.exists() ? String(snap.val()) : null;
}

export function subscribeEvenings(listener: EveningsListener): () => void {
  if (getDataMode() === "demo") {
    eveningsListeners.add(listener);
    listener(getEveningsSnapshotSync());
    return () => eveningsListeners.delete(listener);
  }

  const db = getFirebaseDb();
  if (!db) {
    listener({ active: null, evenings: [], archives: [] });
    return () => undefined;
  }

  let activeId: string | null = null;
  let eveningsMap: Record<string, Evening> = {};
  let archivesList: ArchiveSummary[] = [];

  const emit = () => {
    const evenings = Object.values(eveningsMap).sort(
      (a, b) => b.createdAt - a.createdAt,
    );
    const active =
      (activeId && eveningsMap[activeId]) ||
      evenings.find((e) => e.status === "active") ||
      null;
    listener({
      active,
      evenings,
      archives: [...archivesList].sort((a, b) => b.archivedAt - a.archivedAt),
    });
  };

  void ensureEveningsReady().then(() => {
    /* subscriptions already attached */
  });

  const unsubActive = onValue(ref(db, "activeEveningId"), (snap) => {
    activeId = snap.exists() ? String(snap.val()) : null;
    emit();
  });

  const unsubEvenings = onValue(ref(db, "evenings"), (snap) => {
    const val = snap.val() as Record<string, Partial<Evening>> | null;
    eveningsMap = {};
    if (val) {
      for (const [id, row] of Object.entries(val)) {
        const e = normalizeEvening(id, row);
        if (e) eveningsMap[id] = e;
      }
    }
    emit();
  });

  const unsubArchives = onValue(ref(db, "archives"), (snap) => {
    const val = snap.val() as Record<string, Partial<ArchiveSummary>> | null;
    archivesList = [];
    if (val) {
      for (const [id, row] of Object.entries(val)) {
        const a = normalizeArchive(id, row);
        if (a) archivesList.push(a);
      }
    }
    emit();
  });

  return () => {
    unsubActive();
    unsubEvenings();
    unsubArchives();
  };
}

/**
 * Archivia la serata attiva (solo riepilogo numerico) e ne crea una nuova.
 * Le prenotazioni dettagliate vengono eliminate.
 */
export async function archiveAndCreateEvening(newLabel: string): Promise<{
  archive: ArchiveSummary;
  evening: Evening;
}> {
  const label = newLabel.trim();
  if (!label) throw new Error("Inserisci un nome per la nuova serata");

  await ensureEveningsReady();

  if (getDataMode() === "demo") {
    const store = readDemoStore();
    const current = store.evenings[store.activeEveningId];
    if (!current) throw new Error("Nessuna serata attiva");

    const currentReservations = store.reservations[current.id] ?? [];
    const archive = buildArchiveSummary(current, currentReservations);

    const newId = createId();
    const evening: Evening = {
      id: newId,
      label,
      status: "active",
      createdAt: Date.now(),
    };

    const next: DemoStore = {
      activeEveningId: newId,
      evenings: {
        ...store.evenings,
        [current.id]: { ...current, status: "archived" },
        [newId]: evening,
      },
      reservations: {
        ...store.reservations,
        [current.id]: [],
        [newId]: [],
      },
      archives: {
        ...store.archives,
        [current.id]: archive,
      },
    };
    // Rimuovi dettagli prenotazioni della serata archiviata
    delete next.reservations[current.id];
    writeDemoStore(next);
    return { archive, evening };
  }

  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase non configurato");

  const activeId = await getActiveEveningId();
  if (!activeId) throw new Error("Nessuna serata attiva");

  const eveningSnap = await get(ref(db, `evenings/${activeId}`));
  const current = normalizeEvening(
    activeId,
    eveningSnap.val() as Partial<Evening> | null,
  );
  if (!current) throw new Error("Serata attiva non trovata");

  const resSnap = await get(ref(db, `eveningReservations/${activeId}`));
  const reservations: Reservation[] = [];
  if (resSnap.exists()) {
    const rows = resSnap.val() as Record<string, Partial<Reservation>>;
    for (const [id, row] of Object.entries(rows)) {
      if (!row?.name) continue;
      const adults = Number(row.adults ?? 0);
      const children = Number(row.children ?? 0);
      reservations.push({
        id,
        name: String(row.name),
        phone: String(row.phone ?? ""),
        adults,
        children,
        total: Number(row.total ?? adults + children),
        notes: String(row.notes ?? ""),
        zone: String(row.zone ?? ""),
        tableNumber: Number(row.tableNumber ?? 0),
        arrived: Boolean(row.arrived),
        date: String(row.date ?? current.label),
        updatedAt: Number(row.updatedAt ?? Date.now()),
      });
    }
  }

  const archive = buildArchiveSummary(current, reservations);
  const newId = createId();
  const evening: Evening = {
    id: newId,
    label,
    status: "active",
    createdAt: Date.now(),
  };

  await set(ref(db, `archives/${activeId}`), {
    eveningLabel: archive.eveningLabel,
    archivedAt: archive.archivedAt,
    totalPeopleBooked: archive.totalPeopleBooked,
    reservationCount: archive.reservationCount,
    arrivedPeopleCount: archive.arrivedPeopleCount,
  });
  await update(ref(db, `evenings/${activeId}`), { status: "archived" });
  await remove(ref(db, `eveningReservations/${activeId}`));
  await set(ref(db, `evenings/${newId}`), {
    label: evening.label,
    status: evening.status,
    createdAt: evening.createdAt,
  });
  await set(ref(db, "activeEveningId"), newId);

  return { archive, evening };
}

/** Crea la prima serata se non esiste (senza archiviare). */
export async function createFirstEveningIfNeeded(label?: string): Promise<Evening> {
  await ensureEveningsReady();
  if (getDataMode() === "demo") {
    const store = readDemoStore();
    const active = store.evenings[store.activeEveningId];
    if (active) return active;
  }
  const db = getFirebaseDb();
  if (!db) {
    const store = readDemoStore();
    return store.evenings[store.activeEveningId]!;
  }
  const activeId = await getActiveEveningId();
  if (activeId) {
    const snap = await get(ref(db, `evenings/${activeId}`));
    const e = normalizeEvening(activeId, snap.val() as Partial<Evening> | null);
    if (e) return e;
  }
  const id = createId();
  const evening: Evening = {
    id,
    label: (label ?? EVENT_DATE).trim() || EVENT_DATE,
    status: "active",
    createdAt: Date.now(),
  };
  await set(ref(db, `evenings/${id}`), {
    label: evening.label,
    status: evening.status,
    createdAt: evening.createdAt,
  });
  await set(ref(db, "activeEveningId"), id);
  return evening;
}

export function resetDemoEvenings() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(DEMO_EVENINGS_STORAGE_KEY);
  localStorage.removeItem(DEMO_STORAGE_KEY);
  demoStore = null;
  writeDemoStore(seedDemoStore());
}
