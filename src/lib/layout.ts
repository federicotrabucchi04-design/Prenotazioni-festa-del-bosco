import { createDefaultLayout, LAYOUT_STORAGE_KEY } from "@/lib/layout-utils";
import { getFirebaseDb, isFirebaseConfigured } from "@/lib/firebase";
import type { VenueLayout, ZoneLayout, TableSpot } from "@/lib/types";
import { onValue, ref, set } from "firebase/database";

type Listener = (layout: VenueLayout) => void;

const listeners = new Set<Listener>();

function notify(layout: VenueLayout) {
  listeners.forEach((l) => l(layout));
}

function normalizeLayout(raw: Partial<VenueLayout> | null): VenueLayout {
  if (!raw || !Array.isArray(raw.zones) || raw.zones.length === 0) {
    return createDefaultLayout();
  }

  const zones: ZoneLayout[] = raw.zones.map((z, zi) => ({
    id: String(z.id || `zone_${zi}`),
    name: String(z.name || `Zona ${zi + 1}`),
    tables: Array.isArray(z.tables)
      ? z.tables.map((t: Partial<TableSpot>, ti: number) => ({
          id: String(t.id || `t_${zi}_${ti}`),
          number: Number(t.number ?? ti + 1),
          x: Number(t.x ?? 20),
          y: Number(t.y ?? 20),
          capacity: Math.max(1, Number(t.capacity ?? 8)),
        }))
      : [],
  }));

  return { zones, updatedAt: Number(raw.updatedAt ?? Date.now()) };
}

function readDemoLayout(): VenueLayout {
  if (typeof window === "undefined") return createDefaultLayout();
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) {
      const seeded = createDefaultLayout();
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    return normalizeLayout(JSON.parse(raw) as Partial<VenueLayout>);
  } catch {
    return createDefaultLayout();
  }
}

function writeDemoLayout(layout: VenueLayout) {
  localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  notify(layout);
}

function dataMode(): "firebase" | "demo" {
  return isFirebaseConfigured() ? "firebase" : "demo";
}

export function subscribeLayout(listener: Listener): () => void {
  if (dataMode() === "demo") {
    listeners.add(listener);
    listener(readDemoLayout());
    return () => listeners.delete(listener);
  }

  const db = getFirebaseDb();
  if (!db) {
    listeners.add(listener);
    listener(createDefaultLayout());
    return () => listeners.delete(listener);
  }

  const layoutRef = ref(db, "venueLayout");
  return onValue(
    layoutRef,
    (snap) => {
      if (!snap.exists()) {
        const seeded = createDefaultLayout();
        void set(layoutRef, seeded);
        listener(seeded);
        return;
      }
      listener(normalizeLayout(snap.val() as Partial<VenueLayout>));
    },
    () => listener(createDefaultLayout()),
  );
}

export async function saveLayout(layout: VenueLayout) {
  const next = { ...layout, updatedAt: Date.now() };

  if (dataMode() === "demo") {
    writeDemoLayout(next);
    return next;
  }

  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase non configurato");
  await set(ref(db, "venueLayout"), next);
  return next;
}

export function resetDemoLayout() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LAYOUT_STORAGE_KEY);
  notify(readDemoLayout());
}
