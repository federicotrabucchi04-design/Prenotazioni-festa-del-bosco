"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MapMark, VenueLayout, ZoneLayout } from "@/lib/types";
import type {
  CartinaExtraTable,
  CartinaPrefs,
  ZoneOnBoard,
} from "@/lib/cartina";
import {
  autoPlaceZones,
  cartinaFlipForView,
  computeTableFillRects,
  EXTRA_TABLES_ZONE_ID,
  EXTRA_TABLES_ZONE_NAME,
  gapsFromPlacement,
  marksForDisplay,
  mirrorLeft,
  mirrorTop,
  unmirrorCoord,
  unmirrorLeft,
  unmirrorTop,
  zoneAccentColor,
  zoneRotationStyle,
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
      if (remote.mirrorOrdini === true) out.mirrorOrdini = true;
      if (remote.mirrorSchermo === true) out.mirrorSchermo = true;
      if (remote.centerOrdini === true) out.centerOrdini = true;
      if (remote.centerSchermo === true) out.centerSchermo = true;
      if (
        remote.mirrored === true &&
        remote.mirrorOrdini == null &&
        remote.mirrorSchermo == null
      ) {
        out.mirrored = true;
      }
      return out;
    }
  }
  const out: CartinaPrefs = {
    placements: autoPlaceZones(layout.zones),
    marks: remote?.marks ?? [],
  };
  if (extras?.length) out.extraTables = extras;
  if (remote?.mirrorOrdini === true) out.mirrorOrdini = true;
  if (remote?.mirrorSchermo === true) out.mirrorSchermo = true;
  if (remote?.centerOrdini === true) out.centerOrdini = true;
  if (remote?.centerSchermo === true) out.centerSchermo = true;
  if (
    remote?.mirrored === true &&
    remote.mirrorOrdini == null &&
    remote.mirrorSchermo == null
  ) {
    out.mirrored = true;
  }
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

/** Larghezza stimata (fallback; il fit reale usa misurazione DOM) */
function contentWidthEm(nums: number[], withDashes: boolean) {
  let em = 0;
  nums.forEach((n, i) => {
    if (withDashes && i > 0) em += 0.35;
    em += String(n).length * 0.62;
  });
  return Math.max(em, 0.5);
}

/** Più numeri → lungo l’asse più lungo della cella */
function shouldStackVertical(cellW: number, cellH: number, count: number) {
  if (count <= 1) return false;
  return cellH > cellW;
}

/**
 * Stima iniziale font (poi raffinata con binary search sul DOM).
 * Coefficienti conservativi per font-black tabular-nums.
 */
function estimateFontPx(
  cellW: number,
  cellH: number,
  nums: number[],
  stackVertical: boolean,
): number {
  if (cellW < 2 || cellH < 2 || nums.length === 0) return 1;
  const usableW = cellW * 0.98;
  const usableH = cellH * 0.98;

  if (stackVertical) {
    const lineH = usableH / nums.length;
    const maxDigits = Math.max(...nums.map((n) => String(n).length));
    const byH = lineH * 0.98;
    const byW = usableW / (maxDigits * 0.62);
    return Math.max(1, Math.min(byH, byW));
  }

  const byH = usableH * 0.98;
  const byW = usableW / contentWidthEm(nums, nums.length > 1);
  return Math.max(1, Math.min(byH, byW));
}

/**
 * Font massimo che entra nella cella senza tagliare (misura DOM reale).
 */
function fitFontToBox(
  box: HTMLElement,
  content: HTMLElement,
  textNodes: HTMLElement[],
  seedPx: number,
): number {
  const maxW = box.clientWidth;
  const maxH = box.clientHeight;
  if (maxW < 2 || maxH < 2 || textNodes.length === 0) return 1;

  const apply = (px: number) => {
    for (const n of textNodes) n.style.fontSize = `${px}px`;
  };

  const fits = (px: number) => {
    apply(px);
    // offset* più affidabile di scroll* con flex centering
    return content.offsetWidth <= maxW - 1 && content.offsetHeight <= maxH - 1;
  };

  let lo = 1;
  let hi = Math.max(
    2,
    Math.min(
      Math.floor(Math.max(maxW, maxH) * 1.2),
      Math.ceil(seedPx * 1.35) + 4,
    ),
  );

  if (!fits(1)) {
    apply(1);
    return 1;
  }
  // Alza il tetto se c’è ancora spazio
  if (fits(hi)) {
    let grow = hi;
    const cap = Math.floor(Math.max(maxW, maxH));
    while (grow < cap && fits(grow + 1)) grow += 1;
    apply(grow);
    return grow;
  }

  while (lo < hi) {
    const mid = Math.ceil((lo + hi + 1) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid - 1;
  }
  apply(lo);
  return lo;
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

const EXTRA_TABLE_ACCENT = "#2d5a27";

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
  deleteTableMode = false,
  textPlaceMode = false,
  selectedTextMarkId = null,
  onTableClick,
  onDrawTable,
  onDeleteExtraTable,
  onDeleteZoneOccasional,
  onPlaceText,
  onSelectTextMark,
  onMoveTextMark,
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
  /** Modalità: tap su tavolo extra per eliminarlo */
  deleteTableMode?: boolean;
  /** Modalità: tap per inserire una scritta */
  textPlaceMode?: boolean;
  selectedTextMarkId?: string | null;
  onTableClick?: (zone: ZoneLayout, tableNumber: number) => void;
  onDrawTable?: (rect: {
    x: number;
    y: number;
    w: number;
    h: number;
  }) => void;
  onDeleteExtraTable?: (table: CartinaExtraTable) => void;
  onDeleteZoneOccasional?: (zone: ZoneLayout, tableId: string) => void;
  onPlaceText?: (pos: { x: number; y: number }) => void;
  onSelectTextMark?: (id: string | null) => void;
  onMoveTextMark?: (id: string, pos: { x: number; y: number }) => void;
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
  const flip = cartinaFlipForView(
    prefs,
    isDisplay ? "schermo" : "ordini",
  );

  const boardRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<DrawDraft | null>(null);
  const draftRef = useRef<DrawDraft | null>(null);
  const [dragMarkPreview, setDragMarkPreview] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const dragMarkRef = useRef<{
    id: string;
    pointerId: number;
    ox: number;
    oy: number;
    startX: number;
    startY: number;
  } | null>(null);

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
    onDrawTable({
      x: unmirrorLeft(x, w, flip.flipX),
      y: unmirrorTop(y, h, flip.flipY),
      w,
      h,
    });
  }

  function stopMarkDrag(commit: boolean) {
    const drag = dragMarkRef.current;
    const preview = dragMarkPreview;
    dragMarkRef.current = null;
    setDragMarkPreview(null);
    if (!commit || !drag || !preview || !onMoveTextMark) return;
    onMoveTextMark(drag.id, {
      x: unmirrorCoord(snapGrid(preview.x, CARTINA_GRID_SNAP), flip.flipX),
      y: unmirrorCoord(snapGrid(preview.y, CARTINA_GRID_SNAP), flip.flipY),
    });
  }

  useEffect(() => {
    setDragMarkPreview(null);
    dragMarkRef.current = null;
  }, [prefs.marks, flip.flipX, flip.flipY]);

  const draftRect = draft ? normRect(draft) : null;
  const toolActive = drawTableMode || deleteTableMode || textPlaceMode;
  const displayMarks = marksForDisplay(prefs.marks as MapMark[], flip).map((mark) =>
    dragMarkPreview && mark.id === dragMarkPreview.id
      ? { ...mark, x: dragMarkPreview.x, y: dragMarkPreview.y }
      : mark,
  );

  return (
    <div
      ref={boardRef}
      className={`order-cartina-view relative h-full w-full overflow-hidden bg-white ${className} ${
        drawTableMode
          ? "cursor-crosshair touch-none"
          : textPlaceMode
            ? "cursor-cell"
            : deleteTableMode
              ? "cursor-pointer"
              : ""
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
          : textPlaceMode
            ? (e) => {
                if ((e.target as HTMLElement).closest("[data-extra-ui]")) return;
                e.preventDefault();
                const el = boardRef.current;
                if (!el || !onPlaceText) return;
                const p = pointerInEl(e, el);
                onPlaceText({
                  x: unmirrorCoord(snapGrid(p.x, CARTINA_GRID_SNAP), flip.flipX),
                  y: unmirrorCoord(snapGrid(p.y, CARTINA_GRID_SNAP), flip.flipY),
                });
              }
            : interactive && !toolActive && onMoveTextMark
              ? (e) => {
                  if ((e.target as HTMLElement).closest("[data-extra-ui]")) {
                    onSelectTextMark?.(null);
                  }
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
          : interactive && !toolActive && onMoveTextMark
            ? (e) => {
                const drag = dragMarkRef.current;
                const el = boardRef.current;
                if (!drag || !el) return;
                const p = pointerInEl(e, el);
                const x = Math.min(100, Math.max(0, snapGrid(drag.startX + (p.x - drag.ox), CARTINA_GRID_SNAP)));
                const y = Math.min(100, Math.max(0, snapGrid(drag.startY + (p.y - drag.oy), CARTINA_GRID_SNAP)));
                setDragMarkPreview({ id: drag.id, x, y });
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
          : interactive && !toolActive && onMoveTextMark
            ? (e) => {
                const el = boardRef.current;
                if (el?.hasPointerCapture(e.pointerId)) {
                  el.releasePointerCapture(e.pointerId);
                }
                stopMarkDrag(true);
              }
            : undefined
      }
      onPointerCancel={
        drawTableMode
          ? () => setDraftBoth(null)
          : interactive && !toolActive && onMoveTextMark
            ? () => stopMarkDrag(false)
            : undefined
      }
    >
      <ZoneMarksLayer
        marks={displayMarks}
        selectedId={selectedTextMarkId}
        interactive={interactive && !toolActive}
        interactiveKinds={["text"]}
        onSelect={onSelectTextMark}
        onDragStart={(id, mode, e) => {
          if (mode !== "move" || !boardRef.current) return;
          const mark = displayMarks.find((m) => m.id === id && m.kind === "text");
          if (!mark) return;
          const p = pointerInEl(e, boardRef.current);
          boardRef.current.setPointerCapture(e.pointerId);
          dragMarkRef.current = {
            id,
            pointerId: e.pointerId,
            ox: p.x,
            oy: p.y,
            startX: mark.x,
            startY: mark.y,
          };
          setDragMarkPreview({ id, x: mark.x, y: mark.y });
        }}
      />
      {items.map(({ zone, placement }) => {
        const accent = zoneAccentColor(zone);
        const { gapX, gapY } = gapsFromPlacement(placement);
        const rects = computeTableFillRects(zone.tables, gapX, gapY).map(
          (r) => ({
            ...r,
            x: mirrorLeft(r.x, r.w, flip.flipX),
            y: mirrorTop(r.y, r.h, flip.flipY),
          }),
        );
        const left = mirrorLeft(placement.x, placement.w, flip.flipX);
        const top = mirrorTop(placement.y, placement.h, flip.flipY);

        return (
          <section
            key={zone.id}
            className={`absolute flex flex-col overflow-hidden bg-white ${
              isDisplay
                ? "rounded-none border"
                : "rounded-md border-2 shadow-sm"
            } ${drawTableMode || textPlaceMode ? "pointer-events-none" : ""}`}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: `${placement.w}%`,
              height: `${placement.h}%`,
              borderColor: accent,
            }}
          >
            <div
              className="flex h-full w-full flex-col"
              style={zoneRotationStyle(placement)}
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
                <ZoneMarksLayer marks={zone.marks ?? []} />
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
                const stackVertical = shouldStackVertical(w, h, nums.length);
                const occasional = Boolean(table.occasional);
                const canDelete =
                  deleteTableMode && occasional && Boolean(onDeleteZoneOccasional);
                const canAssign =
                  interactive && !toolActive;
                const Tag = canAssign || canDelete ? "button" : "div";

                return (
                  <Tag
                    key={table.id}
                    {...(canAssign
                      ? {
                          type: "button" as const,
                          onClick: () => onTableClick?.(zone, table.number),
                        }
                      : canDelete
                        ? {
                            type: "button" as const,
                            onClick: () =>
                              onDeleteZoneOccasional?.(zone, table.id),
                          }
                        : {})}
                    className={`absolute p-0 text-center transition ${
                      canAssign || canDelete
                        ? "active:scale-95 touch-manipulation"
                        : ""
                    } ${isHit ? "z-30" : "z-[1]"} ${
                      canDelete ? "ring-2 ring-red-500 ring-inset" : ""
                    }`}
                    style={{
                      left: `${x}%`,
                      top: `${y}%`,
                      width: `${w}%`,
                      height: `${h}%`,
                      backgroundColor: "#ffffff",
                      boxShadow: `inset 0 0 0 1px ${accent}44`,
                      overflow: isHit ? "visible" : "hidden",
                    }}
                    title={`Tavolo ${table.number}`}
                  >
                    {nums.length > 0 ? (
                      <TableOrderNums
                        nums={nums}
                        stackVertical={stackVertical}
                        numberScale={numberScale}
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
        const stackVertical = shouldStackVertical(
          table.w,
          table.h,
          nums.length,
        );
        const canDelete =
          deleteTableMode && Boolean(onDeleteExtraTable);
        const canAssign = interactive && !toolActive;
        const Tag = canAssign || canDelete ? "button" : "div";

        return (
          <Tag
            key={table.id}
            data-extra-ui
            {...(canAssign
              ? {
                  type: "button" as const,
                  onClick: () =>
                    onTableClick?.(extraTablesZone(), table.number),
                }
              : canDelete
                ? {
                    type: "button" as const,
                    onClick: () => onDeleteExtraTable?.(table),
                  }
                : {})}
            className={`absolute z-20 p-0 text-center transition ${
              canAssign || canDelete
                ? "active:scale-95 touch-manipulation"
                : ""
            } ${isHit ? "z-30" : ""} ${
              drawTableMode ? "pointer-events-auto" : ""
            } ${canDelete ? "ring-2 ring-red-500 ring-inset" : ""}`}
            style={{
              left: `${mirrorLeft(table.x, table.w, flip.flipX)}%`,
              top: `${mirrorTop(table.y, table.h, flip.flipY)}%`,
              width: `${table.w}%`,
              height: `${table.h}%`,
              backgroundColor: "#ffffff",
              boxShadow: `inset 0 0 0 1px ${EXTRA_TABLE_ACCENT}44`,
              overflow: isHit ? "visible" : "hidden",
            }}
            title={`Tavolo ${table.number}`}
          >
            {nums.length > 0 ? (
              <TableOrderNums
                nums={nums}
                stackVertical={stackVertical}
                numberScale={numberScale}
                accent={EXTRA_TABLE_ACCENT}
                colorRanges={colorRanges}
                highlightOrder={isHit ? highlight!.orderNumber : null}
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

      {draftRect && draftRect.w > 0.5 && draftRect.h > 0.5 ? (
        <div
          className="pointer-events-none absolute z-40 border-2 border-dashed border-[var(--forest)] bg-[var(--forest)]/15"
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
  stackVertical: stackVerticalHint,
  numberScale,
  accent,
  colorRanges,
  highlightOrder,
  highlightColor,
  highlightRadius,
}: {
  nums: number[];
  stackVertical: boolean;
  numberScale: number;
  accent: string;
  colorRanges: OrderColorRange[];
  highlightOrder: number | null;
  highlightColor: string;
  highlightRadius: number;
}) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const contentRef = useRef<HTMLSpanElement>(null);
  const [fontPx, setFontPx] = useState(8);
  const [stackVertical, setStackVertical] = useState(stackVerticalHint);

  useLayoutEffect(() => {
    setStackVertical(stackVerticalHint);
  }, [stackVerticalHint, nums.join(",")]);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const content = contentRef.current;
    if (!box || !content) return;

    const run = () => {
      const cw = box.clientWidth;
      const ch = box.clientHeight;
      if (cw < 2 || ch < 2 || nums.length === 0) {
        setFontPx(1);
        return;
      }

      const measuredVertical = shouldStackVertical(cw, ch, nums.length);
      if (measuredVertical !== stackVertical) {
        setStackVertical(measuredVertical);
        return;
      }

      const seed =
        estimateFontPx(cw, ch, nums, stackVertical) *
        Math.max(0.85, numberScale);
      const nodes = Array.from(
        content.querySelectorAll<HTMLElement>("[data-fit-text]"),
      );
      setFontPx(fitFontToBox(box, content, nodes, seed));
    };

    run();
    const ro = new ResizeObserver(run);
    ro.observe(box);
    return () => ro.disconnect();
  }, [nums, stackVertical, numberScale, highlightOrder]);

  const fontSize = `${fontPx}px`;

  return (
    <span
      ref={boxRef}
      className="relative z-[1] flex h-full w-full items-center justify-center overflow-hidden"
    >
      <span
        ref={contentRef}
        className={`inline-flex max-h-full max-w-full items-center justify-center ${
          stackVertical ? "flex-col" : "flex-row flex-nowrap"
        }`}
        style={{ lineHeight: 1 }}
      >
        {nums.map((orderNum, i) => {
          const hit = highlightOrder === orderNum;
          return (
            <span
              key={orderNum}
              className="inline-flex items-center"
              style={{ lineHeight: 1 }}
            >
              {!stackVertical && i > 0 ? (
                <span
                  data-fit-text
                  className="font-black tabular-nums"
                  style={{
                    fontSize,
                    color: accent,
                    lineHeight: 1,
                    padding: "0 0.02em",
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
      style={{ lineHeight: 1 }}
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
        data-fit-text
        className="relative z-[1] block font-black tabular-nums"
        style={{ fontSize, color, lineHeight: 1 }}
      >
        {orderNum}
      </span>
    </span>
  );
}
