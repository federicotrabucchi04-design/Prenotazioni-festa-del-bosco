import type { Reservation, VenueLayout, ZoneLayout } from "@/lib/types";

export const CARTINA_PREFS_KEY = "fdb-cartina-prefs";

export type CartinaColumns = 1 | 2 | 3 | 4;

export interface CartinaPrefs {
  /** Ordine degli id zona */
  zoneOrder: string[];
  /** Zone escluse dalla cartina */
  hiddenZoneIds: string[];
  columns: CartinaColumns;
}

export function defaultCartinaPrefs(layout: VenueLayout): CartinaPrefs {
  return {
    zoneOrder: layout.zones.map((z) => z.id),
    hiddenZoneIds: [],
    columns: 2,
  };
}

export function loadCartinaPrefs(layout: VenueLayout): CartinaPrefs {
  const fallback = defaultCartinaPrefs(layout);
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(CARTINA_PREFS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<CartinaPrefs>;
    const known = new Set(layout.zones.map((z) => z.id));
    const order = (parsed.zoneOrder ?? [])
      .filter((id) => known.has(id))
      .concat(layout.zones.map((z) => z.id).filter((id) => !(parsed.zoneOrder ?? []).includes(id)));
    const hidden = (parsed.hiddenZoneIds ?? []).filter((id) => known.has(id));
    const columns = ([1, 2, 3, 4] as const).includes(parsed.columns as CartinaColumns)
      ? (parsed.columns as CartinaColumns)
      : 2;
    return { zoneOrder: order, hiddenZoneIds: hidden, columns };
  } catch {
    return fallback;
  }
}

export function saveCartinaPrefs(prefs: CartinaPrefs) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CARTINA_PREFS_KEY, JSON.stringify(prefs));
}

export function orderedVisibleZones(
  layout: VenueLayout,
  prefs: CartinaPrefs,
): ZoneLayout[] {
  const byId = new Map(layout.zones.map((z) => [z.id, z]));
  const hidden = new Set(prefs.hiddenZoneIds);
  const ordered: ZoneLayout[] = [];
  for (const id of prefs.zoneOrder) {
    const z = byId.get(id);
    if (z && !hidden.has(id)) ordered.push(z);
  }
  for (const z of layout.zones) {
    if (!prefs.zoneOrder.includes(z.id) && !hidden.has(z.id)) ordered.push(z);
  }
  return ordered;
}

/** Nomi ospiti per tavolo (solo tavoli assegnati) */
export function namesByTable(
  reservations: Reservation[],
  zoneName: string,
): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (const r of reservations) {
    if (r.zone !== zoneName || !r.tableNumber || r.tableNumber <= 0) continue;
    const list = map.get(r.tableNumber) ?? [];
    list.push(r.name.trim() || "—");
    map.set(r.tableNumber, list);
  }
  return map;
}

/** Colonne griglia tavoli dentro una zona */
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
