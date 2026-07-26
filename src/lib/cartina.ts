import type { Reservation, VenueLayout, ZoneLayout } from "@/lib/types";

export const CARTINA_PREFS_KEY = "fdb-cartina-prefs-v2";

export interface ZonePlacement {
  zoneId: string;
  /** Riga 0-based */
  row: number;
  /** Colonna 0-based */
  col: number;
  rowSpan: number;
  colSpan: number;
}

export interface CartinaPrefs {
  gridRows: number;
  gridCols: number;
  placements: ZonePlacement[];
}

export const MIN_GRID = 1;
export const MAX_GRID = 6;

export function clampGrid(n: number) {
  return Math.min(MAX_GRID, Math.max(MIN_GRID, Math.round(n)));
}

export function defaultCartinaPrefs(layout: VenueLayout): CartinaPrefs {
  const n = layout.zones.length;
  const cols = clampGrid(n <= 2 ? n : n <= 4 ? 2 : n <= 6 ? 3 : 4);
  const rows = clampGrid(Math.ceil(Math.max(1, n) / cols));
  const placements: ZonePlacement[] = layout.zones.map((z, i) => ({
    zoneId: z.id,
    row: Math.floor(i / cols),
    col: i % cols,
    rowSpan: 1,
    colSpan: 1,
  }));
  return { gridRows: rows, gridCols: cols, placements };
}

function migrateLegacyPrefs(
  raw: Record<string, unknown>,
  layout: VenueLayout,
): CartinaPrefs | null {
  const order = raw.zoneOrder;
  const columns = raw.columns;
  if (!Array.isArray(order) || typeof columns !== "number") return null;
  const known = new Set(layout.zones.map((z) => z.id));
  const hidden = new Set(
    Array.isArray(raw.hiddenZoneIds)
      ? (raw.hiddenZoneIds as string[]).filter((id) => known.has(id))
      : [],
  );
  const ids = (order as string[]).filter((id) => known.has(id) && !hidden.has(id));
  for (const z of layout.zones) {
    if (!ids.includes(z.id) && !hidden.has(z.id)) ids.push(z.id);
  }
  const cols = clampGrid(columns);
  const rows = clampGrid(Math.max(1, Math.ceil(ids.length / cols)));
  return {
    gridRows: rows,
    gridCols: cols,
    placements: ids.map((zoneId, i) => ({
      zoneId,
      row: Math.floor(i / cols),
      col: i % cols,
      rowSpan: 1,
      colSpan: 1,
    })),
  };
}

export function loadCartinaPrefs(layout: VenueLayout): CartinaPrefs {
  const fallback = defaultCartinaPrefs(layout);
  if (typeof window === "undefined") return fallback;
  try {
    const rawV2 = localStorage.getItem(CARTINA_PREFS_KEY);
    const rawLegacy = localStorage.getItem("fdb-cartina-prefs");
    const raw = rawV2 ?? rawLegacy;
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (Array.isArray(parsed.placements)) {
      const known = new Set(layout.zones.map((z) => z.id));
      const gridRows = clampGrid(Number(parsed.gridRows) || fallback.gridRows);
      const gridCols = clampGrid(Number(parsed.gridCols) || fallback.gridCols);
      const placements = (parsed.placements as ZonePlacement[])
        .filter((p) => known.has(p.zoneId))
        .map((p) => normalizePlacement(p, gridRows, gridCols))
        .filter((p, i, arr) => arr.findIndex((x) => x.zoneId === p.zoneId) === i);
      return { gridRows, gridCols, placements };
    }

    const migrated = migrateLegacyPrefs(parsed, layout);
    if (migrated) {
      saveCartinaPrefs(migrated);
      return migrated;
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

export function normalizePlacement(
  p: ZonePlacement,
  gridRows: number,
  gridCols: number,
): ZonePlacement {
  const rowSpan = Math.min(Math.max(1, p.rowSpan || 1), gridRows);
  const colSpan = Math.min(Math.max(1, p.colSpan || 1), gridCols);
  const row = Math.min(Math.max(0, p.row), Math.max(0, gridRows - rowSpan));
  const col = Math.min(Math.max(0, p.col), Math.max(0, gridCols - colSpan));
  return { zoneId: p.zoneId, row, col, rowSpan, colSpan };
}

/** Celle coperte da un placement (inclusa la cella d'origine) */
export function cellsCovered(p: ZonePlacement): string[] {
  const keys: string[] = [];
  for (let r = p.row; r < p.row + p.rowSpan; r++) {
    for (let c = p.col; c < p.col + p.colSpan; c++) {
      keys.push(`${r}:${c}`);
    }
  }
  return keys;
}

export function placementFits(
  candidate: ZonePlacement,
  others: ZonePlacement[],
  gridRows: number,
  gridCols: number,
): boolean {
  const p = normalizePlacement(candidate, gridRows, gridCols);
  if (p.row + p.rowSpan > gridRows || p.col + p.colSpan > gridCols) return false;
  const used = new Set<string>();
  for (const o of others) {
    if (o.zoneId === p.zoneId) continue;
    for (const k of cellsCovered(o)) used.add(k);
  }
  return cellsCovered(p).every((k) => !used.has(k));
}

export function placedZoneIds(prefs: CartinaPrefs): Set<string> {
  return new Set(prefs.placements.map((p) => p.zoneId));
}

export function resolvePlacedZones(
  layout: VenueLayout,
  prefs: CartinaPrefs,
): { zone: ZoneLayout; placement: ZonePlacement }[] {
  const byId = new Map(layout.zones.map((z) => [z.id, z]));
  const out: { zone: ZoneLayout; placement: ZonePlacement }[] = [];
  for (const p of prefs.placements) {
    const zone = byId.get(p.zoneId);
    if (!zone) continue;
    out.push({
      zone,
      placement: normalizePlacement(p, prefs.gridRows, prefs.gridCols),
    });
  }
  return out;
}

export interface GuestLabel {
  name: string;
  total: number;
}

/** Ospiti per tavolo (solo assegnati), con persone */
export function guestsByTable(
  reservations: Reservation[],
  zoneName: string,
): Map<number, GuestLabel[]> {
  const map = new Map<number, GuestLabel[]>();
  for (const r of reservations) {
    if (r.zone !== zoneName || !r.tableNumber || r.tableNumber <= 0) continue;
    const list = map.get(r.tableNumber) ?? [];
    list.push({
      name: r.name.trim() || "—",
      total: r.total,
    });
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

/** @deprecated usa guestsByTable */
export function namesByTable(
  reservations: Reservation[],
  zoneName: string,
): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (const [n, guests] of guestsByTable(reservations, zoneName)) {
    map.set(
      n,
      guests.map((g) => formatGuestLabel(g)),
    );
  }
  return map;
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

export const SPAN_PRESETS: { label: string; rowSpan: number; colSpan: number }[] = [
  { label: "1×1", rowSpan: 1, colSpan: 1 },
  { label: "2×1", rowSpan: 2, colSpan: 1 },
  { label: "1×2", rowSpan: 1, colSpan: 2 },
  { label: "2×2", rowSpan: 2, colSpan: 2 },
  { label: "3×1", rowSpan: 3, colSpan: 1 },
  { label: "1×3", rowSpan: 1, colSpan: 3 },
];
