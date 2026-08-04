"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { MapMark, VenueLayout, ZoneLayout } from "@/lib/types";
import type {
  CartinaExtraTable,
  CartinaPrefs,
  ZoneOnBoard,
} from "@/lib/cartina";
import {
  autoPlaceZones,
  computeTableFillRects,
  EXTRA_TABLES_ZONE_ID,
  EXTRA_TABLES_ZONE_NAME,
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
import { CARTINA_GRID_SNAP, snapGrid } from "@/lib/layout-utils";

export function resolveOrderCartina(
  layout: VenueLayout,
  remote: CartinaPrefs | null,
): CartinaPrefs {
  const extras = remote?.extraTables?.length
    ? remote.extraTables
    : undefined;
  if (remote && remote.placements.length > 0) {
    const known = new Set(layout.zones.map((z) => z.id));
    const placements = remote.placements.filter((p) => known.has(p.zoneId));
    if (placements.length > 0) {
      const out: CartinaPrefs = {
        placements,
        marks: remote.marks ?? [],
      };
      if (extras?.length) out.extraTables = extras;
      return out;
    }
  }
  const out: CartinaPrefs = {
    placements: autoPlaceZones(layout.zones),
    marks: remote?.marks ?? [],
  };
  if (extras?.length) out.extraTables = extras;
  return out;
}

export function extraTablesZone(): ZoneLayout {
  return {
    id: EXTRA_TABLES_ZONE_ID,
    name: EXTRA_TABLES_ZONE_NAME,
    tables: [],
    marks: [],
  };
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

  const byH = cellH * heightRatio;
  const needEm = contentWidthEm(nums, nums.length > 1);
  const byW = (cellW * 0.98) / needEm;
  return Math.max(10, Math.min(byH, byW));
}

type DrawDraft = { x0: number; y0: number; x1: number; y1: number };

function normRect(d: DrawDraft) {
  const x = Math.min(d.x0, d.x1);
  const y = Math.min(d.y0, d.y1);
  const w = Math.abs(d.x1 - d.x0);
  const h = Math.abs(d.y1 - d.y0);
  return { x, y, w, h };
}

function pointerInEl(
  e: { clientX: number; clientY: number },
  el: HTMLElement,
) {
  const rect = el.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return { x: 0, y: 0 };
  return {
    x: Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)),
    y: Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100)),
  };
}

const EXTRA_ACCENT = "#b45309";

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
  drawTableMode = false,
  onTableClick,
  onDrawTable,
  onDeleteExtraTable,
  onDeleteZoneOccasional,
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
  /** Modalità: disegna rettangolo ovunque sulla cartina */
  drawTableMode?: boolean;
  onTableClick?: (zone: ZoneLayout, tableNumber: number) => void;
  onDrawTable?: (rect: {
    x: number;
    y: number;
    w: number;
    h: number;
  }) => void;
  onDeleteExtraTable?: (table: CartinaExtraTable) => void;
  onDeleteZoneOccasional?: (zone: ZoneLayout, tableId: string) => void;
  className?: string;
}) {
  const byId = new Map(layout.zones.map((z) => [z.id, z]));
  const items = prefs.placements
    .map((p) => {
      const zone = byId.get(p.zoneId);
      return zone ? { zone, placement: p } : null;
    })
    .filter(Boolean) as { zone: ZoneLayout; placement: ZoneOnBoard }[];

  const extraTables = prefs.extraTables ?? [];
  const isDisplay = variant === "display";
  const heightRatio = Math.min(
    0.96,
    Math.max(0.82, (isDisplay ? 0.94 : 0.9) * numberScale),
  );

  const boardRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<DrawDraft | null>(null);
  const draftRef = useRef<DrawDraft | null>(null);

  function setDraftBoth(next: DrawDraft | null) {
    draftRef.current = next;
    setDraft(next);
  }

  function finishDraw() {
    const d = draftRef.current;
    setDraftBoth(null);
    if (!d || !onDrawTable) return;
    let { x, y, w, h } = normRect(d);
    x = snapGrid(x, CARTINA_GRID_SNAP);
    y = snapGrid(y, CARTINA_GRID_SNAP);
    w = snapGrid(w, CARTINA_GRID_SNAP);
    h = snapGrid(h, CARTINA_GRID_SNAP);
    const min = CARTINA_GRID_SNAP * 2;
    if (w < min || h < min) return;
    w = Math.min(w, 100 - x);
    h = Math.min(h, 100 - y);
    if (w < min || h < min) return;
    onDrawTable({ x, y, w, h });
  }

  const draftRect = draft ? normRect(draft) : null;
  const canManageExtras = interactive && !isDisplay;

  return (
    <div
      ref={boardRef}
      className={`order-cartina-view relative h-full w-full overflow-hidden bg-white ${className} ${
        drawTableMode ? "cursor-crosshair touch-none" : ""
      }`}
      style={
        drawTableMode
          ? {
              backgroundImage:
                "linear-gradient(rgba(45,90,39,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(45,90,39,0.08) 1px, transparent 1px)",
              backgroundSize: `${CARTINA_GRID_SNAP}% ${CARTINA_GRID_SNAP}%`,
            }
          : undefined
      }
      onPointerDown={
        drawTableMode
          ? (e) => {
              if ((e.target as HTMLElement).closest("[data-extra-ui]")) return;
              e.preventDefault();
              const el = boardRef.current;
              if (!el) return;
              el.setPointerCapture(e.pointerId);
              const p = pointerInEl(e, el);
              setDraftBoth({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
            }
          : undefined
      }
      onPointerMove={
        drawTableMode
          ? (e) => {
              const d = draftRef.current;
              if (!d) return;
              const el = boardRef.current;
              if (!el) return;
              const p = pointerInEl(e, el);
              setDraftBoth({ ...d, x1: p.x, y1: p.y });
            }
          : undefined
      }
      onPointerUp={
        drawTableMode
          ? (e) => {
              const el = boardRef.current;
              if (el?.hasPointerCapture(e.pointerId)) {
                el.releasePointerCapture(e.pointerId);
              }
              finishDraw();
            }
          : undefined
      }
      onPointerCancel={drawTableMode ? () => setDraftBoth(null) : undefined}
    >
      <ZoneMarksLayer marks={prefs.marks as MapMark[]} />
      {items.map(({ zone, placement }) => {
        const accent = zoneAccentColor(zone);
        const { gapX, gapY } = gapsFromPlacement(placement);
        // Solo tavoli griglia: gli occasional di zona legacy restano nel fill,
        // ma i nuovi extra sono a livello foglio.
        const rects = computeTableFillRects(zone.tables, gapX, gapY);

        return (
          <section
            key={zone.id}
            className={`absolute flex flex-col overflow-hidden bg-white ${
              isDisplay
                ? "rounded-none border"
                : "rounded-md border-2 shadow-sm"
            } ${drawTableMode ? "pointer-events-none" : ""}`}
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
                const nums = ordersForTable(
                  assignments,
                  zone.id,
                  table.number,
                );
                const isHit =
                  isDisplay &&
                  highlight != null &&
                  highlight.found &&
                  nums.includes(highlight.orderNumber);
                const stackVertical = nums.length > 1 && h > w;
                const canClick = interactive && !drawTableMode;
                const Tag = canClick ? "button" : "div";
                const occasional = Boolean(table.occasional);

                return (
                  <Tag
                    key={table.id}
                    {...(canClick
                      ? {
                          type: "button" as const,
                          onClick: () => onTableClick?.(zone, table.number),
                        }
                      : {})}
                    className={`absolute p-0 text-center transition ${
                      canClick ? "active:scale-95 touch-manipulation" : ""
                    } ${isHit ? "z-30" : "z-[1]"}`}
                    style={{
                      left: `${x}%`,
                      top: `${y}%`,
                      width: `${w}%`,
                      height: `${h}%`,
                      backgroundColor: occasional
                        ? "rgba(245, 158, 11, 0.12)"
                        : "#ffffff",
                      boxShadow: occasional
                        ? `inset 0 0 0 2px ${accent}`
                        : `inset 0 0 0 1px ${accent}44`,
                      outline: occasional
                        ? `1px dashed ${accent}`
                        : undefined,
                      outlineOffset: occasional ? -3 : undefined,
                      overflow: isHit ? "visible" : "hidden",
                    }}
                    title={
                      occasional
                        ? `Tavolo extra ${table.number}`
                        : `Tavolo ${table.number}`
                    }
                  >
                    {canManageExtras &&
                    occasional &&
                    onDeleteZoneOccasional ? (
                      <span
                        data-extra-ui
                        className="absolute right-0 top-0 z-20"
                      >
                        <button
                          type="button"
                          className="flex h-5 w-5 items-center justify-center rounded-bl bg-red-600 text-[10px] font-bold text-white"
                          aria-label={`Elimina tavolo ${table.number}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteZoneOccasional(zone, table.id);
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ) : null}
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
                      <span
                        className={`flex h-full w-full items-center justify-center text-[10px] ${
                          occasional
                            ? "font-bold text-amber-700/70"
                            : "text-[var(--forest)]/20"
                        }`}
                      >
                        {occasional ? `T${table.number}` : "·"}
                      </span>
                    )}
                  </Tag>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Tavoli extra a livello foglio (anche fuori zona) */}
      {extraTables.map((table) => {
        const nums = ordersForTable(
          assignments,
          EXTRA_TABLES_ZONE_ID,
          table.number,
        );
        const isHit =
          isDisplay &&
          highlight != null &&
          highlight.found &&
          nums.includes(highlight.orderNumber);
        const stackVertical = nums.length > 1 && table.h > table.w;
        const canClick = interactive && !drawTableMode;
        const Tag = canClick ? "button" : "div";

        return (
          <Tag
            key={table.id}
            data-extra-ui
            {...(canClick
              ? {
                  type: "button" as const,
                  onClick: () =>
                    onTableClick?.(extraTablesZone(), table.number),
                }
              : {})}
            className={`absolute z-20 p-0 text-center transition ${
              canClick ? "active:scale-95 touch-manipulation" : ""
            } ${isHit ? "z-30" : ""} ${
              drawTableMode ? "pointer-events-auto" : ""
            }`}
            style={{
              left: `${table.x}%`,
              top: `${table.y}%`,
              width: `${table.w}%`,
              height: `${table.h}%`,
              backgroundColor: "rgba(245, 158, 11, 0.18)",
              boxShadow: `inset 0 0 0 2px ${EXTRA_ACCENT}`,
              outline: `1px dashed ${EXTRA_ACCENT}`,
              outlineOffset: -3,
              overflow: isHit ? "visible" : "hidden",
            }}
            title={`Tavolo extra ${table.number}`}
          >
            {canManageExtras && onDeleteExtraTable ? (
              <span
                data-extra-ui
                className="absolute right-0 top-0 z-20"
              >
                <button
                  type="button"
                  className="flex h-5 w-5 items-center justify-center rounded-bl bg-red-600 text-[10px] font-bold text-white touch-manipulation"
                  aria-label={`Elimina tavolo extra ${table.number}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteExtraTable(table);
                  }}
                >
                  ×
                </button>
              </span>
            ) : null}
            {nums.length > 0 ? (
              <TableOrderNums
                nums={nums}
                stackVertical={stackVertical}
                heightRatio={heightRatio}
                accent={EXTRA_ACCENT}
                colorRanges={colorRanges}
                highlightOrder={isHit ? highlight!.orderNumber : null}
                highlightColor={highlightColor}
                highlightRadius={highlightRadius}
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[10px] font-bold text-amber-800/80">
                T{table.number}
              </span>
            )}
          </Tag>
        );
      })}

      {draftRect && draftRect.w > 0.5 && draftRect.h > 0.5 ? (
        <div
          className="pointer-events-none absolute z-40 border-2 border-dashed border-amber-500 bg-amber-400/25"
          style={{
            left: `${draftRect.x}%`,
            top: `${draftRect.y}%`,
            width: `${draftRect.w}%`,
            height: `${draftRect.h}%`,
          }}
        />
      ) : null}
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
