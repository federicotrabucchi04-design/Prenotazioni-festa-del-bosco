"use client";

import type { MapMark, VenueLayout, ZoneLayout } from "@/lib/types";
import type { CartinaPrefs, ZoneOnBoard } from "@/lib/cartina";
import {
  autoPlaceZones,
  computeTableFillRects,
  gapsFromPlacement,
  zoneAccentColor,
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
  // Numeri fluidi rispetto al contenitore (TV / tablet / pannello PC)
  const fontSize = isDisplay
    ? `clamp(0.75rem, calc(${(3.8 * numberScale).toFixed(2)} * 1cqmin), 4.5rem)`
    : `clamp(0.65rem, calc(${(2.6 * numberScale).toFixed(2)} * 1cqmin), 2.2rem)`;

  return (
    <div
      className={`order-cartina-view relative h-full w-full overflow-hidden bg-white ${className}`}
      style={{ containerType: "size" }}
    >
      <ZoneMarksLayer marks={prefs.marks as MapMark[]} />
      {items.map(({ zone, placement }) => {
        const accent = zoneAccentColor(zone);
        const { gapX, gapY } = gapsFromPlacement(placement);
        const rects = computeTableFillRects(zone.tables, gapX, gapY);
        return (
          <section
            key={zone.id}
            className={`absolute flex flex-col overflow-hidden bg-white ${
              isDisplay ? "rounded-none border" : "rounded-md border-2 shadow-sm"
            }`}
            style={{
              left: `${placement.x}%`,
              top: `${placement.y}%`,
              width: `${placement.w}%`,
              height: `${placement.h}%`,
              borderColor: accent,
            }}
          >
            {!placement.hideTitle ? (
              <h4
                className={`shrink-0 text-center font-bold leading-tight text-white ${
                  isDisplay
                    ? "px-0.5 py-[0.15cqmin] text-[clamp(8px,1.6cqmin,18px)]"
                    : "px-1 py-0.5 text-[10px] sm:text-xs"
                }`}
                style={{ backgroundColor: accent }}
              >
                {zone.name}
              </h4>
            ) : null}
            <div className="relative min-h-0 flex-1 bg-white">
              {rects.map(({ table, x, y, w, h }) => {
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
                    className={`absolute flex items-center justify-center overflow-visible text-center transition ${
                      interactive ? "active:scale-95 touch-manipulation" : ""
                    } ${isHit ? "z-20" : ""}`}
                    style={{
                      left: `${x}%`,
                      top: `${y}%`,
                      width: `${w}%`,
                      height: `${h}%`,
                      backgroundColor: isHit
                        ? `${highlightColor}18`
                        : "#ffffff",
                      boxShadow: `inset 0 0 0 1px ${accent}44`,
                    }}
                  >
                    {isHit ? (
                      <span
                        className="pointer-events-none absolute z-0 animate-order-pulse rounded-full"
                        style={{
                          inset: isDisplay ? "2%" : "4%",
                          borderStyle: "solid",
                          borderWidth: isDisplay
                            ? "clamp(3px, 1.1cqmin, 12px)"
                            : "3px",
                          borderColor: highlightColor,
                          boxShadow: `0 0 0 clamp(2px, 0.6cqmin, 8px) ${highlightColor}55`,
                        }}
                        aria-hidden
                      />
                    ) : null}
                    {orderNum ? (
                      <span
                        className="relative z-[1] font-black leading-none tabular-nums"
                        style={{
                          fontSize,
                          color: isHit ? highlightColor : numColor,
                        }}
                      >
                        {orderNum}
                      </span>
                    ) : (
                      <span className="relative z-[1] text-[clamp(6px,1.2cqmin,12px)] text-[var(--forest)]/20">
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
