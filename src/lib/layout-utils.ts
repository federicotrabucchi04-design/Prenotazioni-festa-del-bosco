import type { Reservation, TableSpot, VenueLayout, ZoneLayout } from "@/lib/types";
import { createId } from "@/lib/constants";

/** Quanti posti oltre la capacità sono ammessi senza override */
export const CAPACITY_OVERFLOW = 2;

export const LAYOUT_STORAGE_KEY = "fdb-venue-layout";

const DEFAULT_ZONE_NAMES = [
  "Tenda 1",
  "Tenda 2",
  "Tenda 3",
  "Tenda 4",
  "Balera",
  "Centro Bar",
  "Campo da Calcio",
];

function defaultTablesForZone(count = 12, capacity = 8): TableSpot[] {
  const cols = 4;
  const tables: TableSpot[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    tables.push({
      id: createId(),
      number: i + 1,
      x: 12 + col * 24,
      y: 14 + row * 28,
      capacity,
    });
  }
  return tables;
}

export function createDefaultLayout(): VenueLayout {
  return {
    updatedAt: Date.now(),
    zones: DEFAULT_ZONE_NAMES.map((name) => ({
      id: createId(),
      name,
      tables: defaultTablesForZone(12, 8),
      marks: [],
    })),
  };
}

export function softCapacityLimit(capacity: number) {
  return capacity + CAPACITY_OVERFLOW;
}

export function getZoneByName(layout: VenueLayout, zoneName: string) {
  return layout.zones.find((z) => z.name === zoneName) ?? null;
}

export function getTable(
  layout: VenueLayout,
  zoneName: string,
  tableNumber: number,
): TableSpot | null {
  const zone = getZoneByName(layout, zoneName);
  if (!zone) return null;
  return zone.tables.find((t) => t.number === tableNumber) ?? null;
}

export function checkTableCapacity(options: {
  layout: VenueLayout;
  reservations: Reservation[];
  zone: string;
  tableNumber: number;
  incomingPeople: number;
  excludeReservationId?: string;
}): import("@/lib/types").CapacityCheck {
  const table = getTable(options.layout, options.zone, options.tableNumber);
  const capacity = table?.capacity ?? 8;
  const softLimit = softCapacityLimit(capacity);

  const others = options.reservations.filter(
    (r) =>
      r.zone === options.zone &&
      r.tableNumber === options.tableNumber &&
      r.id !== options.excludeReservationId,
  );
  const currentOthers = others.reduce((sum, r) => sum + r.total, 0);
  const proposedTotal = currentOthers + options.incomingPeople;
  const overBy = Math.max(0, proposedTotal - softLimit);

  return {
    ok: proposedTotal <= softLimit,
    capacity,
    softLimit,
    currentOthers,
    incoming: options.incomingPeople,
    proposedTotal,
    overBy,
    guests: others.map((r) => `${r.name} (${r.total})`),
  };
}

export function nextTableNumber(zone: ZoneLayout) {
  const used = new Set(zone.tables.map((t) => t.number));
  let n = 1;
  while (used.has(n)) n += 1;
  return n;
}

export function clampPercent(value: number) {
  return Math.min(92, Math.max(8, value));
}
