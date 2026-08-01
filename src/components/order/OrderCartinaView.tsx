"use client";

import { useLayoutEffect, useRef, useState } from "react";
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

/** Larghezza stimata in em (cifre tabular-nums + eventuali "-") */
function contentWidthEm(nums: number[], withDashes: boolean) {
  let em = 0;
  nums.forEach((n, i) => {
    if (withDashes && i > 0) em += 0.38;
    em += String(n).length * 0.52;
  });
  return Math.max(em, 0.5);
}

/**
 * Font in px: priorità altezza tavolo (~92%).
 * Riduce solo se la riga non entra in larghezza.
 */
function fontPxForCell(
  cellW: number,
  cellH: number,
  nums: number[],
  stackVertical: boolean,
  heightRatio: number,
): number {
  if (cellW < 2 || cellH < 2 || nums.length === 0) return 10;

  if (stackVertical) {
    const lineH = cellH / nums.length;
    const byH = lineH * heightRatio;
    const maxDigits = Math.max(...nums.map((n) => String(n).length));
    const byW = cellW / (maxDigits * 0.52);
    return Math.max(10, Math.min(byH, byW));
  }

  // Orizzontale (1 numero o più con trattino): quasi tutta l’altezza
  const byH = cellH * heightRatio;
  const needEm = contentWidthEm(nums, nums.length > 1);
  const byW = (cellW * 0.98) / needEm;
  return Math.max(10, Math.min(byH, byW));
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
  const heightRatio = Math.min(
    0.96,
    Math.max(0.82, (isDisplay ? 0.94 : 0.9) * numberScale),
  );

  return (
    <div
      className={`order-cartina-view relative h-full w-full overflow-hidden bg-white ${className}`}
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
                const stackVertical = nums.length > 1 && h > w;
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
                    className={`absolute p-0 text-center transition ${
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
                    }}
                  >
                    {nums.length > 0 ? (
                      <TableOrderNums
                        nums={nums}
                        stackVertical={stackVertical}
                        heightRatio={heightRatio}
                        accent={accent}
                        colorRanges={colorRanges}
                        highlightOrder={
                          isHit ? highlight!.orderNumber : null
                        }
                        highlightColor={highlightColor}
                        highlightRadius={highlightRadius}
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-[10px] text-[var(--forest)]/20">
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

function TableOrderNums({
  nums,
  stackVertical,
  heightRatio,
  accent,
  colorRanges,
  highlightOrder,
  highlightColor,
  highlightRadius,
}: {
  nums: number[];
  stackVertical: boolean;
  heightRatio: number;
  accent: string;
  colorRanges: OrderColorRange[];
  highlightOrder: number | null;
  highlightColor: string;
  highlightRadius: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [fontPx, setFontPx] = useState(16);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setFontPx(fontPxForCell(w, h, nums, stackVertical, heightRatio));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [nums, stackVertical, heightRatio]);

  const fontSize = `${fontPx}px`;

  if (stackVertical) {
    return (
      <span
        ref={ref}
        className="relative z-[1] flex h-full w-full flex-col items-stretch justify-center"
      >
        {nums.map((orderNum) => {
          const hit = highlightOrder === orderNum;
          return (
            <span
              key={orderNum}
              className="flex min-h-0 flex-1 items-center justify-center"
            >
              <OrderNumGlyph
                orderNum={orderNum}
                fontSize={fontSize}
                color={
                  hit
                    ? highlightColor
                    : colorForOrderNumber(orderNum, colorRanges)
                }
                hit={hit}
                highlightColor={highlightColor}
                highlightRadius={highlightRadius}
              />
            </span>
          );
        })}
      </span>
    );
  }

  return (
    <span
      ref={ref}
      className="relative z-[1] flex h-full w-full flex-row flex-nowrap items-center justify-center"
    >
      {nums.map((orderNum, i) => {
        const hit = highlightOrder === orderNum;
        return (
          <span key={orderNum} className="inline-flex items-center">
            {i > 0 ? (
              <span
                className="font-black leading-none tabular-nums"
                style={{
                  fontSize,
                  color: accent,
                  padding: "0 0.05em",
                }}
                aria-hidden
              >
                -
              </span>
            ) : null}
            <OrderNumGlyph
              orderNum={orderNum}
              fontSize={fontSize}
              color={
                hit
                  ? highlightColor
                  : colorForOrderNumber(orderNum, colorRanges)
              }
              hit={hit}
              highlightColor={highlightColor}
              highlightRadius={highlightRadius}
            />
          </span>
        );
      })}
    </span>
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
