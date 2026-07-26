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
import {
  colorForOrderNumber,
  type OrderColorRange,
} from "@/lib/app-settings";

export function resolveOrderCartina(
  layout: VenueLayout,
  remote: CartinaPrefs | null,
): CartinaPrefs {
  if (remote && remote.placements.length > 0) {
    const known = new Set(layout.zones.map((z) => z.id));
    const placements = remote.placements.filter((p) => known.has(p.zoneId));
    if (placements.length > 0) {
      return { placements, marks: remote.marks ?? [] };
    }
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
  variant = "setup",
  highlightColor = "#dc2626",
  numberScale = 1,
  colorRanges = [],
  onTableClick,
  className = "",
}: {
  layout: VenueLayout;
  prefs: CartinaPrefs;
  assignments: OrderAssignments;
  highlight: OrderHighlight | null;
  interactive?: boolean;
  variant?: "setup" | "display";
  highlightColor?: string;
  numberScale?: number;
  colorRanges?: OrderColorRange[];
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

  const isDisplay = variant === "display";
  const baseRem = isDisplay ? 1.25 : 0.85;
  const fontRem = Math.max(0.55, baseRem * numberScale);

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
            className={`absolute flex flex-col overflow-hidden bg-white ${
              isDisplay
                ? "rounded-none border border-[var(--forest)]"
                : "rounded-md border-2 border-[var(--forest)] shadow-sm"
            }`}
            style={{
              left: `${placement.x}%`,
              top: `${placement.y}%`,
              width: `${placement.w}%`,
              height: `${placement.h}%`,
            }}
          >
            <h4
              className={`shrink-0 bg-[var(--forest)] text-center font-bold leading-tight text-white ${
                isDisplay ? "px-0.5 py-0.5 text-[9px] sm:text-[11px]" : "px-1 py-0.5 text-[10px] sm:text-xs"
              }`}
            >
              {zone.name}
            </h4>
            <div
              className="grid min-h-0 flex-1 gap-px bg-[var(--forest)]/15 p-px"
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
                const numColor = orderNum
                  ? colorForOrderNumber(orderNum, colorRanges)
                  : "#142418";
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
                    className={`relative flex items-center justify-center overflow-visible text-center transition ${
                      interactive ? "active:scale-95" : ""
                    } ${isHit ? "z-20" : "bg-white"}`}
                    style={
                      isHit
                        ? { backgroundColor: `${highlightColor}18` }
                        : undefined
                    }
                  >
                    {isHit ? (
                      <span
                        className={`pointer-events-none absolute inset-[3%] z-0 animate-order-pulse rounded-full ${
                          isDisplay ? "border-[5px]" : "border-[3px]"
                        }`}
                        style={{
                          borderColor: highlightColor,
                          boxShadow: `0 0 0 5px ${highlightColor}55`,
                        }}
                        aria-hidden
                      />
                    ) : null}
                    {orderNum ? (
                      <span
                        className="relative z-[1] font-black leading-none"
                        style={{
                          fontSize: `${fontRem}rem`,
                          color: isHit ? highlightColor : numColor,
                        }}
                      >
                        {orderNum}
                      </span>
                    ) : (
                      <span className="relative z-[1] text-[7px] text-[var(--forest)]/15">
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
