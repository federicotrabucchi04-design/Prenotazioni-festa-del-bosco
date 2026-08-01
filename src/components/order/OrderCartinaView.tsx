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

/** Unità di larghezza approssimative (cifre + trattini) per fit orizzontale */
function horizontalWidthUnits(nums: number[]) {
  let units = 0;
  nums.forEach((n, i) => {
    if (i > 0) units += 0.42; // "-"
    units += String(n).length * 0.58;
  });
  return Math.max(units, 1);
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
  highlightRadius = 1.55,
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
  /** Diametro cerchio in em rispetto al numero (da impostazioni admin) */
  highlightRadius?: number;
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
  const heightFillPct = Math.min(
    96,
    Math.max(70, (isDisplay ? 92 : 88) * numberScale),
  ).toFixed(1);

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
              isDisplay
                ? "rounded-none border"
                : "rounded-md border-2 shadow-sm"
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
            <div className="relative min-h-0 flex-1 overflow-hidden bg-white">
              {rects.map(({ table, x, y, w, h }) => {
                const nums = ordersForTable(assignments, zone.id, table.number);
                const isHit =
                  isDisplay &&
                  highlight != null &&
                  highlight.found &&
                  nums.includes(highlight.orderNumber);
                // Più alto che largo → a capo senza trattino; altrimenti riga con "-"
                const stackVertical = nums.length > 1 && h > w;
                const Tag = interactive ? "button" : "div";

                const rowFontSize = `min(${heightFillPct}cqh, ${(
                  98 / horizontalWidthUnits(nums)
                ).toFixed(1)}cqw)`;

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
                    } ${isHit ? "z-30" : "z-[1]"}`}
                    style={{
                      left: `${x}%`,
                      top: `${y}%`,
                      width: `${w}%`,
                      height: `${h}%`,
                      backgroundColor: "#ffffff",
                      boxShadow: `inset 0 0 0 1px ${accent}44`,
                      overflow: isHit ? "visible" : "hidden",
                      padding: "1%",
                      containerType: "size",
                    }}
                  >
                    {nums.length > 0 ? (
                      stackVertical ? (
                        <span className="relative z-[1] flex h-full w-full flex-col items-stretch justify-center">
                          {nums.map((orderNum) => {
                            const hitThis =
                              isHit && orderNum === highlight?.orderNumber;
                            const digits = String(orderNum).length;
                            const fontSize = `min(${(
                              90 / nums.length
                            ).toFixed(1)}cqh, ${(
                              96 / Math.max(digits * 0.58, 1)
                            ).toFixed(1)}cqw)`;
                            return (
                              <span
                                key={orderNum}
                                className="flex min-h-0 flex-1 items-center justify-center"
                              >
                                <OrderNumGlyph
                                  orderNum={orderNum}
                                  fontSize={fontSize}
                                  color={
                                    hitThis
                                      ? highlightColor
                                      : colorForOrderNumber(
                                          orderNum,
                                          colorRanges,
                                        )
                                  }
                                  hit={hitThis}
                                  highlightColor={highlightColor}
                                  highlightRadius={highlightRadius}
                                />
                              </span>
                            );
                          })}
                        </span>
                      ) : (
                        <span className="relative z-[1] flex h-full w-full flex-row flex-nowrap items-center justify-center">
                          {nums.map((orderNum, i) => {
                            const hitThis =
                              isHit && orderNum === highlight?.orderNumber;
                            return (
                              <span
                                key={orderNum}
                                className="inline-flex items-center"
                              >
                                {i > 0 ? (
                                  <span
                                    className="font-black leading-none tabular-nums"
                                    style={{
                                      fontSize: rowFontSize,
                                      color: accent,
                                      padding: "0 0.06em",
                                    }}
                                    aria-hidden
                                  >
                                    -
                                  </span>
                                ) : null}
                                <OrderNumGlyph
                                  orderNum={orderNum}
                                  fontSize={rowFontSize}
                                  color={
                                    hitThis
                                      ? highlightColor
                                      : colorForOrderNumber(
                                          orderNum,
                                          colorRanges,
                                        )
                                  }
                                  hit={hitThis}
                                  highlightColor={highlightColor}
                                  highlightRadius={highlightRadius}
                                />
                              </span>
                            );
                          })}
                        </span>
                      )
                    ) : (
                      <span className="relative z-[1] text-[clamp(6px,12cqmin,12px)] text-[var(--forest)]/20">
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

function OrderNumGlyph({
  orderNum,
  fontSize,
  color,
  hit,
  highlightColor,
  highlightRadius,
}: {
  orderNum: number;
  fontSize: string;
  color: string;
  hit: boolean;
  highlightColor: string;
  highlightRadius: number;
}) {
  return (
    <span
      className={`relative inline-flex items-center justify-center ${
        hit ? "z-10" : ""
      }`}
    >
      {hit ? (
        <span
          className="pointer-events-none absolute left-1/2 top-1/2 z-0 aspect-square -translate-x-1/2 -translate-y-1/2 animate-order-pulse rounded-full border-solid"
          style={{
            width: `${highlightRadius}em`,
            height: `${highlightRadius}em`,
            minWidth: `${highlightRadius}em`,
            minHeight: `${highlightRadius}em`,
            borderWidth: `clamp(2px, ${Math.max(0.08, highlightRadius * 0.07)}em, 12px)`,
            borderColor: highlightColor,
            boxShadow: `0 0 0 clamp(1px, ${Math.max(0.04, highlightRadius * 0.04)}em, 6px) ${highlightColor}40`,
            backgroundColor: "transparent",
            fontSize,
          }}
          aria-hidden
        />
      ) : null}
      <span
        className="relative z-[1] font-black leading-none tabular-nums"
        style={{ fontSize, color }}
      >
        {orderNum}
      </span>
    </span>
  );
}
