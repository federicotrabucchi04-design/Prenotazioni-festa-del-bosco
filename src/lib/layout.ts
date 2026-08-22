import { createDefaultLayout, LAYOUT_STORAGE_KEY } from "@/lib/layout-utils";
import { getFirebaseDb, isFirebaseConfigured } from "@/lib/firebase";
import type { VenueLayout, ZoneLayout, TableSpot, MapMark } from "@/lib/types";
import { offlineSet, hasPendingWriteForPath } from "@/lib/offline-sync";
import { onValue, ref } from "firebase/database";

type Listener = (layout: VenueLayout) => void;

const listeners = new Set<Listener>();

function notify(layout: VenueLayout) {
  listeners.forEach((l) => l(layout));
}

/**
 * Firebase RTDB rifiuta `undefined` in qualsiasi proprietà.
 * Costruiamo solo i campi validi per tipo di mark.
 */
function normalizeMark(m: Partial<MapMark>, mi: number): MapMark | null {
  const kind = m.kind;
  if (kind !== "line" && kind !== "rect" && kind !== "text") return null;
  const id = String(m.id || `mark_${mi}`);
  const x = Number(m.x ?? 10);
  const y = Number(m.y ?? 10);
  const color = typeof m.color === "string" ? m.color : undefined;

  if (kind === "line") {
    const mark: MapMark = {
      id,
      kind: "line",
      x,
      y,
      x2: Number(m.x2 ?? x),
      y2: Number(m.y2 ?? y),
    };
    if (color) mark.color = color;
    return mark;
  }

  if (kind === "rect") {
    const mark: MapMark = {
      id,
      kind: "rect",
      x,
      y,
      w: Math.max(1, Number(m.w ?? 10)),
      h: Math.max(1, Number(m.h ?? 10)),
    };
    if (color) mark.color = color;
    return mark;
  }

  const mark: MapMark = {
    id,
    kind: "text",
    x,
    y,
    text: String(m.text ?? "Etichetta"),
  };
  if (color) mark.color = color;
  const fontSize = Number(m.fontSize);
  if (Number.isFinite(fontSize) && fontSize > 0) {
    mark.fontSize = Math.min(16, Math.max(1.2, fontSize));
  }
  const rotation = Number(m.rotation);
  if (rotation === 90 || rotation === 180 || rotation === 270) {
    mark.rotation = rotation;
  }
  return mark;
}

/** Rimuove undefined ricorsivamente (Firebase-safe). */
function stripUndefined<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue;
    out[k] = stripUndefined(v);
  }
  return out as T;
}

function normalizeLayout(raw: Partial<VenueLayout> | null): VenueLayout {
  if (!raw || !Array.isArray(raw.zones) || raw.zones.length === 0) {
    return createDefaultLayout();
  }

  const zones: ZoneLayout[] = raw.zones.map((z, zi) => {
    const color =
      typeof z.color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(z.color)
        ? z.color
        : undefined;
    const zone: ZoneLayout = {
      id: String(z.id || `zone_${zi}`),
      name: String(z.name || `Zona ${zi + 1}`),
      tables: Array.isArray(z.tables)
        ? z.tables.map((t: Partial<TableSpot>, ti: number) => {
            const table: TableSpot = {
              id: String(t.id || `t_${zi}_${ti}`),
              number: Number(t.number ?? ti + 1),
              x: Number(t.x ?? 20),
              y: Number(t.y ?? 20),
              capacity: Math.max(1, Number(t.capacity ?? 8)),
            };
            if (t.occasional === true) {
              table.occasional = true;
              table.w = Math.max(2, Number(t.w ?? 14));
              table.h = Math.max(2, Number(t.h ?? 12));
            }
            return table;
          })
        : [],
      marks: Array.isArray(z.marks)
        ? z.marks
            .map((m: Partial<MapMark>, mi: number) => normalizeMark(m, mi))
            .filter((m): m is MapMark => Boolean(m))
        : [],
    };
    if (color) zone.color = color;
    return zone;
  });

  return { zones, updatedAt: Number(raw.updatedAt ?? Date.now()) };
}

/** Layout pronto per `set()` Firebase: niente undefined. */
export function serializeLayout(layout: VenueLayout): VenueLayout {
  const normalized = normalizeLayout(layout);
  return stripUndefined({
    ...normalized,
    updatedAt: Date.now(),
  });
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
  listeners.add(listener);

  if (dataMode() === "demo") {
    listener(readDemoLayout());
    return () => listeners.delete(listener);
  }

  const db = getFirebaseDb();
  if (!db) {
    listener(readDemoLayout());
    return () => listeners.delete(listener);
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    listener(readDemoLayout());
  }

  const layoutRef = ref(db, "venueLayout");
  const unsub = onValue(
    layoutRef,
    (snap) => {
      if (!snap.exists()) {
        // Non sovrascrivere un layout custom ancora in coda offline
        if (hasPendingWriteForPath("venueLayout")) {
          listener(readDemoLayout());
          return;
        }
        const local = readDemoLayout();
        // Se c’è già un layout locale non-vuoto, usalo invece del seed di default
        if (local.zones.length > 0 && local.updatedAt > 0) {
          void offlineSet("venueLayout", serializeLayout(local));
          listener(local);
          return;
        }
        const seeded = serializeLayout(createDefaultLayout());
        void offlineSet("venueLayout", seeded);
        writeDemoLayout(seeded);
        return;
      }
      // Se abbiamo modifiche layout ancora da sync, non far sovrascrivere dalla remote vuota/stale
      if (hasPendingWriteForPath("venueLayout")) {
        listener(readDemoLayout());
        return;
      }
      const next = normalizeLayout(snap.val() as Partial<VenueLayout>);
      try {
        localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      listener(next);
    },
    () => listener(readDemoLayout()),
  );

  return () => {
    listeners.delete(listener);
    unsub();
  };
}

export async function saveLayout(layout: VenueLayout) {
  const next = serializeLayout(layout);
  writeDemoLayout(next);

  if (dataMode() === "demo") {
    return next;
  }

  await offlineSet("venueLayout", next);
  return next;
}

export function resetDemoLayout() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LAYOUT_STORAGE_KEY);
  notify(readDemoLayout());
}
