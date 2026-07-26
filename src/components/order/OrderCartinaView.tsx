"use client";

import type { MapMark, VenueLayout, ZoneLayout } from "@/lib/types";
import type { CartinaPrefs, ZoneOnBoard } from "@/lib/cartina";
import {
  autoPlaceZones,
  sortedTables,
  tableGridColumns,
} from "@/lib/cartina";
import { ZoneMarksLayer } from "@/components/map/ZoneMarksLayer";
import {
  assignmentKey,
  type OrderAssignments,
  type OrderHighlight,
} from "@/lib/order-board";

export function resolveOrderCartina(
  layout: VenueLayout,
  remote: CartinaPrefs | null,
): CartinaPrefs {
  if (remote && remote.placements.length > 0) {
    const known = new Set(layout.zones.map((z) => z.id));
    return {
      placements: remote.placements.filter((p) => known.has(p.zoneId)),
      marks: remote.marks ?? [],
    };
  }
  return { placements: autoPlaceZones(layout.zones), marks: [] };
}

/** Cartina con numeri d’ordine sui tavoli + cerchio highlight */
export function OrderCartinaView({
  layout,
  prefs,
  assignments,
  highlight,
  interactive = false,
  onTableClick,
  className = "",
}: {
  layout: VenueLayout;
  prefs: CartinaPrefs;
  assignments: OrderAssignments;
  highlight: OrderHighlight | null;
  interactive?: boolean;
  onTableClick?: (zone: ZoneLayout, tableNumber: number) => void;
  className?: string;
}) {
  const byId = new Map(layout.zones.map((z) => [z.id, z]));
  const items = prefs.placements
    .map((p) => {
      const zone = byId.get(p.zoneId);
      return zone ? { zone, placement: p } : null;
    })
    .filter(Boolean) as { zone: ZoneLayout; placement: ZoneOnBoard }[];

  return (
    <div
      className={`relative h-full w-full overflow-hidden bg-white ${className}`}
    >
      <ZoneMarksLayer marks={prefs.marks as MapMark[]} />
      {items.map(({ zone, placement }) => {
        const tables = sortedTables(zone);
        const tCols = tableGridColumns(tables.length);
        return (
          <section
            key={zone.id}
            className="absolute flex flex-col overflow-hidden rounded-md border-2 border-[var(--forest)] bg-white"
            style={{
              left: `${placement.x}%`,
              top: `${placement.y}%`,
              width: `${placement.w}%`,
              height: `${placement.h}%`,
            }}
          >
            <h4 className="shrink-0 bg-[var(--forest)] px-1 py-0.5 text-center text-[10px] font-bold text-white sm:text-xs">
              {zone.name}
            </h4>
            <div
              className="grid min-h-0 flex-1 gap-px bg-[var(--forest)]/20 p-px"
              style={{
                gridTemplateColumns: `repeat(${tCols}, minmax(0, 1fr))`,
                gridAutoRows: "1fr",
              }}
            >
              {tables.map((table) => {
                const key = assignmentKey(zone.id, table.number);
                const orderNum = assignments[key];
                const isHit =
                  highlight != null &&
                  highlight.found &&
                  orderNum === highlight.orderNumber;
                const Tag = interactive ? "button" : "div";
                return (
                  <Tag
                    key={table.id}
                    {...(interactive
                      ? {
                          type: "button" as const,
                          onClick: () => onTableClick?.(zone, table.number),
                        }
                      : {})}
                    className={`relative flex items-center justify-center overflow-hidden px-0.5 py-0.5 text-center transition ${
                      interactive ? "active:scale-95" : ""
                    } ${
                      isHit
                        ? "z-10 bg-amber-100"
                        : orderNum
                          ? "bg-[#f3f8f3]"
                          : "bg-white"
                    }`}
                  >
                    {isHit ? (
                      <span
                        className="pointer-events-none absolute inset-0.5 animate-order-pulse rounded-full border-[3px] border-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.25)]"
                        aria-hidden
                      />
                    ) : null}
                    {orderNum ? (
                      <span
                        className={`relative z-[1] text-[11px] font-black leading-none sm:text-sm ${
                          isHit ? "text-amber-800" : "text-[var(--forest-ink)]"
                        }`}
                      >
                        {orderNum}
                      </span>
                    ) : (
                      <span className="relative z-[1] text-[8px] text-[var(--forest)]/25">
                        ·
                      </span>
                    )}
                  </Tag>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
