import type { MapMark, Reservation, VenueLayout, ZoneLayout } from "@/lib/types";
import { createId } from "@/lib/constants";
import { clampPercent } from "@/lib/layout-utils";

export const CARTINA_PREFS_KEY = "fdb-cartina-prefs-v3";

/** Zona posizionata sulla lavagna (coordinate % 0–100) */
export interface ZoneOnBoard {
  zoneId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CartinaPrefs {
  placements: ZoneOnBoard[];
  marks: MapMark[];
}

export const CARTINA_COLORS = [
  { id: "forest", hex: "#2d5a27", label: "Verde" },
  { id: "blue", hex: "#1d4ed8", label: "Blu" },
  { id: "red", hex: "#b91c1c", label: "Rosso" },
  { id: "amber", hex: "#a16207", label: "Ambra" },
  { id: "purple", hex: "#7c3aed", label: "Viola" },
  { id: "teal", hex: "#0f766e", label: "Teal" },
  { id: "black", hex: "#142418", label: "Nero" },
] as const;

export const DEFAULT_ZONE_W = 32;
export const DEFAULT_ZONE_H = 30;
export const MIN_ZONE_SIZE = 14;

export function defaultCartinaPrefs(layout: VenueLayout): CartinaPrefs {
  return {
    placements: autoPlaceZones(layout.zones),
    marks: [],
  };
}

export function autoPlaceZones(zones: ZoneLayout[]): ZoneOnBoard[] {
  const n = zones.length;
  if (n === 0) return [];
  const cols = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(n))));
  const rows = Math.ceil(n / cols);
  const gap = 2;
  const w = Math.min(DEFAULT_ZONE_W, (100 - gap * (cols + 1)) / cols);
  const h = Math.min(DEFAULT_ZONE_H, (100 - gap * (rows + 1)) / rows);
  return zones.map((z, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      zoneId: z.id,
      x: gap + col * (w + gap),
      y: gap + row * (h + gap),
      w,
      h,
    };
  });
}

function migrateFromGrid(raw: Record<string, unknown>, layout: VenueLayout): CartinaPrefs | null {
  if (!Array.isArray(raw.placements) || raw.placements.length === 0) return null;
  const first = raw.placements[0] as Record<string, unknown>;
  if (typeof first.row !== "number" || typeof first.col !== "number") return null;

  const gridRows = Math.max(1, Number(raw.gridRows) || 2);
  const gridCols = Math.max(1, Number(raw.gridCols) || 2);
  const known = new Set(layout.zones.map((z) => z.id));
  const gap = 1.5;
  const cellW = (100 - gap * (gridCols + 1)) / gridCols;
  const cellH = (100 - gap * (gridRows + 1)) / gridRows;

  const placements: ZoneOnBoard[] = [];
  for (const p of raw.placements as Record<string, unknown>[]) {
    const zoneId = String(p.zoneId ?? "");
    if (!known.has(zoneId)) continue;
    const row = Number(p.row) || 0;
    const col = Number(p.col) || 0;
    const rowSpan = Math.max(1, Number(p.rowSpan) || 1);
    const colSpan = Math.max(1, Number(p.colSpan) || 1);
    placements.push({
      zoneId,
      x: gap + col * (cellW + gap),
      y: gap + row * (cellH + gap),
      w: cellW * colSpan + gap * (colSpan - 1),
      h: cellH * rowSpan + gap * (rowSpan - 1),
    });
  }
  return { placements, marks: [] };
}

function migrateFromOrder(raw: Record<string, unknown>, layout: VenueLayout): CartinaPrefs | null {
  if (!Array.isArray(raw.zoneOrder)) return null;
  const known = new Set(layout.zones.map((z) => z.id));
  const hidden = new Set(
    Array.isArray(raw.hiddenZoneIds) ? (raw.hiddenZoneIds as string[]) : [],
  );
  const zones = layout.zones.filter(
    (z) => (raw.zoneOrder as string[]).includes(z.id) && !hidden.has(z.id),
  );
  const extras = layout.zones.filter(
    (z) => !(raw.zoneOrder as string[]).includes(z.id) && !hidden.has(z.id),
  );
  return { placements: autoPlaceZones([...zones, ...extras]), marks: [] };
}

export function loadCartinaPrefs(layout: VenueLayout): CartinaPrefs {
  const fallback = defaultCartinaPrefs(layout);
  if (typeof window === "undefined") return fallback;
  try {
    const rawStr =
      localStorage.getItem(CARTINA_PREFS_KEY) ??
      localStorage.getItem("fdb-cartina-prefs-v2") ??
      localStorage.getItem("fdb-cartina-prefs");
    if (!rawStr) return fallback;
    const parsed = JSON.parse(rawStr) as Record<string, unknown>;

    if (Array.isArray(parsed.placements) && parsed.placements[0]) {
      const sample = parsed.placements[0] as Record<string, unknown>;
      if (typeof sample.x === "number" && typeof sample.w === "number") {
        const known = new Set(layout.zones.map((z) => z.id));
        const placements = (parsed.placements as ZoneOnBoard[])
          .filter((p) => known.has(p.zoneId))
          .map(normalizePlacement)
          .filter((p, i, arr) => arr.findIndex((x) => x.zoneId === p.zoneId) === i);
        const marks = Array.isArray(parsed.marks)
          ? (parsed.marks as MapMark[]).map(normalizeCartinaMark).filter(Boolean) as MapMark[]
          : [];
        const prefs = { placements, marks };
        saveCartinaPrefs(prefs);
        return prefs;
      }
    }

    const fromGrid = migrateFromGrid(parsed, layout);
    if (fromGrid) {
      saveCartinaPrefs(fromGrid);
      return fromGrid;
    }
    const fromOrder = migrateFromOrder(parsed, layout);
    if (fromOrder) {
      saveCartinaPrefs(fromOrder);
      return fromOrder;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export function saveCartinaPrefs(prefs: CartinaPrefs) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CARTINA_PREFS_KEY, JSON.stringify(prefs));
}

export function normalizePlacement(p: ZoneOnBoard): ZoneOnBoard {
  const w = Math.max(MIN_ZONE_SIZE, Math.min(100, p.w));
  const h = Math.max(MIN_ZONE_SIZE, Math.min(100, p.h));
  const x = clampPercent(Math.min(p.x, 100 - w));
  const y = clampPercent(Math.min(p.y, 100 - h));
  return { zoneId: p.zoneId, x, y, w, h };
}

export function normalizeCartinaMark(m: Partial<MapMark>): MapMark | null {
  if (!m || !m.kind) return null;
  const id = m.id || createId();
  const x = clampPercent(Number(m.x) || 0);
  const y = clampPercent(Number(m.y) || 0);
  const color = typeof m.color === "string" ? m.color : undefined;
  if (m.kind === "line") {
    return {
      id,
      kind: "line",
      x,
      y,
      x2: clampPercent(Number(m.x2) || x),
      y2: clampPercent(Number(m.y2) || y),
      color,
    };
  }
  if (m.kind === "rect") {
    return {
      id,
      kind: "rect",
      x,
      y,
      w: Math.max(1, Number(m.w) || 10),
      h: Math.max(1, Number(m.h) || 10),
      color,
    };
  }
  return {
    id,
    kind: "text",
    x,
    y,
    text: String(m.text ?? "Etichetta"),
    color,
  };
}

export function placedZoneIds(prefs: CartinaPrefs): Set<string> {
  return new Set(prefs.placements.map((p) => p.zoneId));
}

export function resolvePlacedZones(
  layout: VenueLayout,
  prefs: CartinaPrefs,
): { zone: ZoneLayout; placement: ZoneOnBoard }[] {
  const byId = new Map(layout.zones.map((z) => [z.id, z]));
  const out: { zone: ZoneLayout; placement: ZoneOnBoard }[] = [];
  for (const p of prefs.placements) {
    const zone = byId.get(p.zoneId);
    if (!zone) continue;
    out.push({ zone, placement: normalizePlacement(p) });
  }
  return out;
}

export interface GuestLabel {
  name: string;
  total: number;
}

export function guestsByTable(
  reservations: Reservation[],
  zoneName: string,
): Map<number, GuestLabel[]> {
  const map = new Map<number, GuestLabel[]>();
  for (const r of reservations) {
    if (r.zone !== zoneName || !r.tableNumber || r.tableNumber <= 0) continue;
    const list = map.get(r.tableNumber) ?? [];
    list.push({ name: r.name.trim() || "—", total: r.total });
    map.set(r.tableNumber, list);
  }
  return map;
}

export function formatGuestLabel(g: GuestLabel): string {
  return `${g.name} (${g.total})`;
}

export function formatTableGuests(guests: GuestLabel[]): string {
  return guests.map(formatGuestLabel).join(" · ");
}

export function tableGridColumns(tableCount: number): number {
  if (tableCount <= 0) return 1;
  if (tableCount <= 4) return Math.min(tableCount, 2);
  if (tableCount <= 9) return 3;
  if (tableCount <= 16) return 4;
  if (tableCount <= 25) return 5;
  return 6;
}

export function sortedTables(zone: ZoneLayout) {
  return [...zone.tables].sort((a, b) => a.number - b.number);
}

export function pointerPercent(
  e: { clientX: number; clientY: number },
  el: HTMLElement,
) {
  const rect = el.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 100;
  const y = ((e.clientY - rect.top) / rect.height) * 100;
  return { x: clampPercent(x), y: clampPercent(y) };
}
