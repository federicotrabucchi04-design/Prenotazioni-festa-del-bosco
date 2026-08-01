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
  ordersForTable,
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

function multiLayout(count: number): { cols: number; rows: number } {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count === 3) return { cols: 3, rows: 1 };
  if (count === 4) return { cols: 2, rows: 2 };
  if (count <= 6) return { cols: 3, rows: 2 };
  if (count <= 9) return { cols: 3, rows: 3 };
  return { cols: 4, rows: Math.ceil(count / 4) };
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
  const baseSize = isDisplay
    ? `calc(${(3.8 * numberScale).toFixed(2)} * 1cqmin)`
    : `calc(${(2.6 * numberScale).toFixed(2)} * 1cqmin)`;

  return (
    <div
      className={`order-cartina-view relative h-full w-full bg-white ${
        isDisplay ? "overflow-visible" : "overflow-hidden"
      } ${className}`}
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
            className={`absolute flex flex-col bg-white ${
              isDisplay
                ? "overflow-visible rounded-none border"
                : "overflow-hidden rounded-md border-2 shadow-sm"
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
            <div
              className={`relative min-h-0 flex-1 bg-white ${
                isDisplay ? "overflow-visible" : "overflow-hidden"
              }`}
            >
              {rects.map(({ table, x, y, w, h }) => {
                const nums = ordersForTable(assignments, zone.id, table.number);
                const isHit =
                  isDisplay &&
                  highlight != null &&
                  highlight.found &&
                  nums.includes(highlight.orderNumber);
                const { cols, rows } = multiLayout(nums.length);
                // Scala così i numeri restano nella cella senza invadere i tavoli vicini
                const cellScale = Math.min(
                  1,
                  1 / Math.max(cols * 0.72, rows * 0.85, Math.sqrt(nums.length || 1) * 0.7),
                );
                const fontSize =
                  nums.length === 0
                    ? undefined
                    : `clamp(0.45rem, calc(${baseSize} * ${cellScale.toFixed(3)}), ${
                        isDisplay ? "4.5rem" : "2.2rem"
                      })`;
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
                    className={`absolute flex items-center justify-center text-center transition ${
                      interactive ? "active:scale-95 touch-manipulation" : ""
                    } ${isHit ? "z-30 overflow-visible" : "overflow-hidden"}`}
                    style={{
                      left: `${x}%`,
                      top: `${y}%`,
                      width: `${w}%`,
                      height: `${h}%`,
                      backgroundColor: "#ffffff",
                      boxShadow: `inset 0 0 0 1px ${accent}44`,
                      padding: nums.length > 1 ? "2%" : 0,
                    }}
                  >
                    {nums.length > 0 ? (
                      <span
                        className="relative z-[1] grid h-full w-full place-items-center gap-[2%]"
                        style={{
                          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                        }}
                      >
                        {nums.map((orderNum) => {
                          const hitThis =
                            isHit && orderNum === highlight?.orderNumber;
                          const numColor = colorForOrderNumber(
                            orderNum,
                            colorRanges,
                          );
                          return (
                            <span
                              key={orderNum}
                              className={`relative flex min-h-0 min-w-0 items-center justify-center font-black leading-none tabular-nums ${
                                hitThis ? "z-10" : ""
                              }`}
                              style={{
                                fontSize,
                                color: hitThis ? highlightColor : numColor,
                              }}
                            >
                              {hitThis ? (
                                <span
                                  className="pointer-events-none absolute left-1/2 top-1/2 z-0 aspect-square -translate-x-1/2 -translate-y-1/2 animate-order-pulse rounded-full border-solid"
                                  style={{
                                    // Solo cerchio sul numero, senza riempire/tagliare il tavolo
                                    width: "1.55em",
                                    height: "1.55em",
                                    minWidth: "1.55em",
                                    minHeight: "1.55em",
                                    borderWidth:
                                      "clamp(3px, 0.85cqmin, 9px)",
                                    borderColor: highlightColor,
                                    boxShadow: `0 0 0 clamp(2px, 0.4cqmin, 5px) ${highlightColor}40`,
                                    backgroundColor: "transparent",
                                  }}
                                  aria-hidden
                                />
                              ) : null}
                              <span className="relative z-[1]">{orderNum}</span>
                            </span>
                          );
                        })}
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
