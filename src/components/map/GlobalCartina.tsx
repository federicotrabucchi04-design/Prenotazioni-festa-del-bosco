"use client";

import { useEffect, useRef, useState } from "react";
import {
  Download,
  Eye,
  Minus,
  MousePointer2,
  Plus,
  Printer,
  Settings2,
  Square,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import toast from "react-hot-toast";
import { useVenueLayout } from "@/hooks/use-venue-layout";
import { useReservations } from "@/hooks/use-reservations";
import { useEvenings } from "@/hooks/use-evenings";
import { useOrderBoard } from "@/hooks/use-order-board";
import { useUiStore } from "@/store/ui-store";
import { EVENT_DATE, createId } from "@/lib/constants";
import { downloadCartinaPng } from "@/lib/cartina-export";
import { ZoneMarksLayer, DEFAULT_MARK_FONT_SIZE } from "@/components/map/ZoneMarksLayer";
import type { MapMark, Reservation, ZoneLayout } from "@/lib/types";
import { saveLayout } from "@/lib/layout";
import {
  type CartinaPrefs,
  type TableGapMode,
  type ZoneOnBoard,
  CARTINA_COLORS,
  DEFAULT_ZONE_H,
  DEFAULT_ZONE_W,
  MIN_ZONE_SIZE,
  autoPlaceZones,
  computeTableFillRects,
  fillPagePlacements,
  formatTableGuests,
  gapsFromPlacement,
  guestsByTable,
  loadCartinaPrefs,
  normalizePlacement,
  placeZonesLikeCartina,
  placedZoneIds,
  pointerPercent,
  resolvePlacedZones,
  saveCartinaPrefs,
  zoneAccentColor,
} from "@/lib/cartina";
import { saveOrderCartina } from "@/lib/order-board";
import { snapGrid, TABLE_GRID_SNAP } from "@/lib/layout-utils";
import { CartinaViewportGuides } from "@/components/map/CartinaViewportGuides";

type Step = "arrange" | "preview";
type Tool = "move" | "line" | "rect" | "text";

export function GlobalCartina() {
  const open = useUiStore((s) => s.printMapOpen);
  const close = useUiStore((s) => s.closePrintMap);
  const { layout } = useVenueLayout();
  const { items } = useReservations();
  const { active } = useEvenings();
  const { board, loading: boardLoading } = useOrderBoard();
  const [step, setStep] = useState<Step>("arrange");
  const [prefs, setPrefs] = useState<CartinaPrefs | null>(null);
  const [publishing, setPublishing] = useState(false);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setStep("arrange");
      setPrefs(null);
    }
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open || prefs !== null || boardLoading) return;
    const remote = board.cartina;
    setPrefs(
      remote && remote.placements.length > 0
        ? remote
        : loadCartinaPrefs(layout),
    );
  }, [open, boardLoading, board.cartina, layout, prefs]);

  const eveningLabel = active?.label ?? EVENT_DATE;
  const title = "Feste del Bosco — disposizione tavoli";
  const subtitle = `Sera del ${eveningLabel}`;

  if (!open) return null;

  const activePrefs = prefs ?? loadCartinaPrefs(layout);
  const placed = resolvePlacedZones(layout, activePrefs);

  function updatePrefs(next: CartinaPrefs) {
    setPrefs(next);
    // Bozza locale: la cartina pubblica si aggiorna solo con «Genera cartina»
    saveCartinaPrefs(next);
  }

  /** Pubblica la cartina su Ordini / Schermo / Computer e apre anteprima */
  async function publishAndPreview() {
    if (activePrefs.placements.length === 0) {
      toast.error("Posiziona almeno una zona sulla lavagna");
      return;
    }
    setPublishing(true);
    try {
      saveCartinaPrefs(activePrefs);
      await saveOrderCartina(activePrefs);
      toast.success("Cartina pubblicata ovunque");
      setStep("preview");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore pubblicazione");
    } finally {
      setPublishing(false);
    }
  }

  function handleDownload() {
    if (placed.length === 0) {
      toast.error("Posiziona almeno una zona sulla lavagna");
      return;
    }
    downloadCartinaPng({
      items: placed,
      marks: activePrefs.marks,
      reservations: items,
      title,
      subtitle,
    });
    toast.success("Cartina scaricata (PNG)");
  }

  function handlePrint() {
    if (placed.length === 0) {
      toast.error("Posiziona almeno una zona sulla lavagna");
      return;
    }
    setStep("preview");
    window.setTimeout(() => window.print(), 180);
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex flex-col bg-[var(--forest-bg)] print:static print:z-auto print:bg-white"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ type: "spring", stiffness: 280, damping: 28 }}
      >
        <header className="no-print flex items-start justify-between gap-3 border-b border-white/50 bg-white/75 px-4 pb-3 pt-[max(0.85rem,env(safe-area-inset-top))] backdrop-blur-xl">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--forest)]">
              Cartina globale
            </p>
            <h2 className="text-lg font-semibold text-[var(--forest-ink)]">
              {step === "arrange" ? "Lavagna disposizione" : "Anteprima per cassa"}
            </h2>
            <p className="text-sm text-[var(--forest-muted)]">
              Disposizione libera · guide TV/A4 tratteggiate · sync allo schermo
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--forest)]/8 text-[var(--forest)]"
            aria-label="Chiudi"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="no-print flex gap-2 border-b border-white/40 px-4 py-2">
          <StepTab
            active={step === "arrange"}
            icon={Settings2}
            label="Modifica"
            onClick={() => setStep("arrange")}
          />
          <StepTab
            active={step === "preview"}
            icon={Eye}
            label="Anteprima"
            onClick={() => void publishAndPreview()}
          />
        </div>

        <div
          className={`min-h-0 flex-1 print:overflow-visible ${
            step === "preview"
              ? "overflow-y-auto overflow-x-hidden overscroll-contain"
              : "overflow-y-auto"
          }`}
        >
          {step === "arrange" ? (
            <CartinaArrangeBoard
              layoutZones={layout.zones}
              prefs={activePrefs}
              onChange={updatePrefs}
              onPreview={() => void publishAndPreview()}
              publishing={publishing}
              onZoneColor={async (zoneId, hex) => {
                try {
                  await saveLayout({
                    ...layout,
                    zones: layout.zones.map((z) =>
                      z.id === zoneId ? { ...z, color: hex } : z,
                    ),
                    updatedAt: Date.now(),
                  });
                  toast.success("Colore zona salvato");
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : "Errore colore zona",
                  );
                }
              }}
            />
          ) : (
            <div className="mx-auto w-full max-w-lg px-3 pb-28 pt-3 print:max-w-none print:p-0">
              <p className="no-print mb-2 text-center text-[11px] text-[var(--forest-muted)]">
                Anteprima A4 verticale (come sullo Schermo TV). Scorri se non
                entra tutta.
              </p>
              <div className="cartina-print-root mx-auto w-full">
                <CartinaSheet
                  items={placed}
                  marks={activePrefs.marks}
                  reservations={items}
                  title={title}
                  subtitle={subtitle}
                />
              </div>
            </div>
          )}
        </div>

        <div className="no-print fixed inset-x-0 bottom-0 z-10 border-t border-white/50 bg-white/90 px-4 pb-[max(0.85rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
          <div className="mx-auto flex max-w-lg gap-2">
            {step === "preview" ? (
              <>
                <button
                  type="button"
                  onClick={() => setStep("arrange")}
                  className="rounded-2xl bg-[var(--forest)]/10 px-4 py-3 text-sm font-semibold text-[var(--forest)]"
                >
                  Modifica
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--forest)]/10 py-3 text-sm font-bold text-[var(--forest)]"
                >
                  <Download className="h-4 w-4" />
                  Scarica PNG
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--forest)] py-3 text-sm font-bold text-white"
                >
                  <Printer className="h-4 w-4" />
                  Stampa
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void publishAndPreview()}
                disabled={placed.length === 0 || publishing}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--forest)] py-3.5 text-sm font-bold text-white disabled:opacity-50"
              >
                <Eye className="h-4 w-4" />
                {publishing ? "Pubblicazione…" : "Genera cartina"}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function CartinaArrangeBoard({
  layoutZones,
  prefs,
  onChange,
  onPreview,
  publishing = false,
  onZoneColor,
}: {
  layoutZones: ZoneLayout[];
  prefs: CartinaPrefs;
  onChange: (next: CartinaPrefs) => void;
  onPreview: () => void;
  publishing?: boolean;
  onZoneColor: (zoneId: string, hex: string) => void | Promise<void>;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>("move");
  const [color, setColor] = useState<string>(CARTINA_COLORS[0]!.hex);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectedMarkId, setSelectedMarkId] = useState<string | null>(null);
  const [pendingZoneId, setPendingZoneId] = useState<string | null>(null);
  const [draftMark, setDraftMark] = useState<MapMark | null>(null);
  const [showGuides, setShowGuides] = useState(true);
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const drag = useRef<{
    zoneId: string;
    mode: "move" | "resize";
    ox: number;
    oy: number;
    start: ZoneOnBoard;
  } | null>(null);
  const markDrag = useRef<{
    markId: string;
    mode: "move" | "resize";
    ox: number;
    oy: number;
    start: MapMark;
  } | null>(null);

  const placedIds = placedZoneIds(prefs);
  const unplaced = layoutZones.filter((z) => !placedIds.has(z.id));
  const selectedPlacement = prefs.placements.find((p) => p.zoneId === selectedZoneId);
  const selectedMark = prefs.marks.find((m) => m.id === selectedMarkId) ?? null;
  const visibleMarks = draftMark ? [...prefs.marks, draftMark] : prefs.marks;

  function patchPrefs(partial: Partial<CartinaPrefs>) {
    onChange({ ...prefs, ...partial });
  }

  function upsertPlacement(next: ZoneOnBoard) {
    const normalized = normalizePlacement(next);
    const rest = prefs.placements.filter((p) => p.zoneId !== next.zoneId);
    patchPrefs({ placements: [...rest, normalized] });
  }

  function removeZone(zoneId: string) {
    patchPrefs({
      placements: prefs.placements.filter((p) => p.zoneId !== zoneId),
    });
    if (selectedZoneId === zoneId) setSelectedZoneId(null);
  }

  function removeMark(id: string) {
    patchPrefs({ marks: prefs.marks.filter((m) => m.id !== id) });
    if (selectedMarkId === id) setSelectedMarkId(null);
  }

  function updateMark(id: string, patch: Partial<MapMark>) {
    patchPrefs({
      marks: prefs.marks.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    });
  }

  function clampBoard(v: number) {
    return Math.min(100, Math.max(0, v));
  }

  function snapBoard(v: number) {
    return snapGrid(clampBoard(v));
  }

  function startMarkDrag(
    id: string,
    mode: "move" | "resize",
    e: React.PointerEvent,
  ) {
    if (tool !== "move" || !boardRef.current) return;
    e.stopPropagation();
    const mark = prefs.marks.find((m) => m.id === id);
    if (!mark) return;
    const { x, y } = pointerPercent(e, boardRef.current);
    setSelectedMarkId(id);
    setSelectedZoneId(null);
    if (mark.color) setColor(mark.color);
    markDrag.current = {
      markId: id,
      mode,
      ox: x,
      oy: y,
      start: { ...mark },
    };
    boardRef.current.setPointerCapture(e.pointerId);
  }

  function applyMarkDrag(x: number, y: number) {
    const d = markDrag.current;
    if (!d) return;
    const dx = x - d.ox;
    const dy = y - d.oy;
    const s = d.start;

    if (d.mode === "move") {
      if (s.kind === "line") {
        updateMark(d.markId, {
          x: snapBoard(s.x + dx),
          y: snapBoard(s.y + dy),
          x2: snapBoard((s.x2 ?? s.x) + dx),
          y2: snapBoard((s.y2 ?? s.y) + dy),
        });
      } else {
        updateMark(d.markId, {
          x: snapBoard(s.x + dx),
          y: snapBoard(s.y + dy),
        });
      }
      return;
    }

    // resize
    if (s.kind === "rect") {
      updateMark(d.markId, {
        w: Math.max(TABLE_GRID_SNAP, snapBoard((s.w ?? 10) + dx)),
        h: Math.max(TABLE_GRID_SNAP, snapBoard((s.h ?? 10) + dy)),
      });
      return;
    }

    if (s.kind === "text") {
      const base = s.fontSize ?? DEFAULT_MARK_FONT_SIZE;
      const next = Math.min(14, Math.max(1.4, base + dy * 0.18 - dx * 0.05));
      updateMark(d.markId, { fontSize: Math.round(next * 10) / 10 });
    }
  }

  function onBoardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!boardRef.current) return;
    const raw = pointerPercent(e, boardRef.current);
    const x = snapBoard(raw.x);
    const y = snapBoard(raw.y);

    if (pendingZoneId && tool === "move") {
      upsertPlacement({
        zoneId: pendingZoneId,
        x: x - DEFAULT_ZONE_W / 2,
        y: y - DEFAULT_ZONE_H / 2,
        w: DEFAULT_ZONE_W,
        h: DEFAULT_ZONE_H,
      });
      setSelectedZoneId(pendingZoneId);
      setPendingZoneId(null);
      setSelectedMarkId(null);
      toast.success("Zona posizionata — trascinala e ridimensionala");
      return;
    }

    if (tool === "text") {
      const text = window.prompt("Testo da aggiungere", "Entrata");
      if (!text?.trim()) return;
      const id = createId();
      patchPrefs({
        marks: [
          ...prefs.marks,
          { id, kind: "text", x, y, text: text.trim(), color },
        ],
      });
      setSelectedMarkId(id);
      setSelectedZoneId(null);
      return;
    }

    if (tool === "line" || tool === "rect") {
      drawStart.current = { x, y };
      setDraftMark({
        id: "draft",
        kind: tool,
        x,
        y,
        x2: x,
        y2: y,
        w: 0,
        h: 0,
        color,
      });
      boardRef.current.setPointerCapture(e.pointerId);
      return;
    }

    // move tool: deselect if clicking empty
    setSelectedZoneId(null);
    setSelectedMarkId(null);
  }

  function onBoardPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!boardRef.current) return;
    const raw = pointerPercent(e, boardRef.current);
    const x = snapBoard(raw.x);
    const y = snapBoard(raw.y);

    if (markDrag.current) {
      applyMarkDrag(raw.x, raw.y);
      return;
    }

    if (drag.current) {
      const d = drag.current;
      if (d.mode === "move") {
        upsertPlacement({
          ...d.start,
          x: d.start.x + (raw.x - d.ox),
          y: d.start.y + (raw.y - d.oy),
        });
      } else {
        upsertPlacement({
          ...d.start,
          w: Math.max(MIN_ZONE_SIZE, raw.x - d.start.x),
          h: Math.max(MIN_ZONE_SIZE, raw.y - d.start.y),
        });
      }
      return;
    }

    if (!draftMark || !drawStart.current) return;
    const start = drawStart.current;
    if (draftMark.kind === "line") {
      setDraftMark({ ...draftMark, x2: x, y2: y });
    } else if (draftMark.kind === "rect") {
      const rx = Math.min(start.x, x);
      const ry = Math.min(start.y, y);
      setDraftMark({
        ...draftMark,
        x: rx,
        y: ry,
        w: Math.abs(x - start.x),
        h: Math.abs(y - start.y),
      });
    }
  }

  function onBoardPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    drag.current = null;
    markDrag.current = null;
    try {
      boardRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    if (!draftMark || !drawStart.current) return;
    const start = drawStart.current;
    drawStart.current = null;

    if (draftMark.kind === "line") {
      const x2 = draftMark.x2 ?? start.x;
      const y2 = draftMark.y2 ?? start.y;
      setDraftMark(null);
      if (Math.hypot(x2 - start.x, y2 - start.y) < 2) return;
      const id = createId();
      patchPrefs({
        marks: [
          ...prefs.marks,
          { id, kind: "line", x: start.x, y: start.y, x2, y2, color },
        ],
      });
      setSelectedMarkId(id);
      return;
    }

    if (draftMark.kind === "rect") {
      const w = draftMark.w ?? 0;
      const h = draftMark.h ?? 0;
      setDraftMark(null);
      if (w < 2 || h < 2) return;
      const id = createId();
      patchPrefs({
        marks: [
          ...prefs.marks,
          {
            id,
            kind: "rect",
            x: draftMark.x,
            y: draftMark.y,
            w,
            h,
            color,
          },
        ],
      });
      setSelectedMarkId(id);
    }
  }

  function startZoneDrag(
    e: React.PointerEvent,
    placement: ZoneOnBoard,
    mode: "move" | "resize",
  ) {
    if (tool !== "move" || !boardRef.current) return;
    e.stopPropagation();
    const { x, y } = pointerPercent(e, boardRef.current);
    setSelectedZoneId(placement.zoneId);
    setSelectedMarkId(null);
    drag.current = {
      zoneId: placement.zoneId,
      mode,
      ox: x,
      oy: y,
      start: { ...placement },
    };
    boardRef.current.setPointerCapture(e.pointerId);
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-2 px-2 py-2 pb-28 sm:px-3">
      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "move", label: "Sposta", icon: MousePointer2 },
            { id: "line", label: "Linea", icon: Minus },
            { id: "rect", label: "Box", icon: Square },
            { id: "text", label: "Scritta", icon: Type },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTool(id);
              setPendingZoneId(null);
            }}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold ${
              tool === id
                ? "bg-[var(--forest)] text-white"
                : "bg-white text-[var(--forest-ink)]"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-[var(--forest-muted)]">
          {selectedZoneId
            ? "Colore zona"
            : selectedMarkId
              ? "Colore segno"
              : "Colore"}
        </span>
        {CARTINA_COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            title={c.label}
            onClick={() => {
              setColor(c.hex);
              if (selectedMarkId) {
                updateMark(selectedMarkId, { color: c.hex });
              } else if (selectedZoneId) {
                void onZoneColor(selectedZoneId, c.hex);
              }
            }}
            className={`h-8 w-8 rounded-full border-2 ${
              color === c.hex ? "border-[var(--forest-ink)] scale-110" : "border-white"
            }`}
            style={{ backgroundColor: c.hex }}
          />
        ))}
      </div>

      {unplaced.length > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-3">
          <p className="mb-2 text-xs font-semibold text-amber-900">
            Zone da mettere sulla lavagna (tocca, poi tocca la griglia)
          </p>
          <div className="flex flex-wrap gap-2">
            {unplaced.map((z) => (
              <button
                key={z.id}
                type="button"
                onClick={() => {
                  setTool("move");
                  setPendingZoneId((cur) => (cur === z.id ? null : z.id));
                  setSelectedZoneId(null);
                  setSelectedMarkId(null);
                }}
                className={`rounded-full px-3 py-2 text-sm font-semibold ${
                  pendingZoneId === z.id
                    ? "bg-amber-700 text-white"
                    : "bg-white text-amber-950"
                }`}
              >
                {z.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            const next = placeZonesLikeCartina(layoutZones);
            onChange(next);
            setSelectedZoneId(null);
            toast.success("Disposizione stile cartina A4 (BAR + CASSA)");
          }}
          className="rounded-2xl bg-[var(--forest)] px-3 py-2 text-xs font-semibold text-white"
        >
          Stile cartina A4
        </button>
        <button
          type="button"
          onClick={() => {
            if (prefs.placements.length === 0) {
              patchPrefs({ placements: autoPlaceZones(layoutZones) });
            } else {
              patchPrefs({
                placements: fillPagePlacements(prefs.placements),
              });
            }
            setSelectedZoneId(null);
            toast.success("Foglio riempito al massimo");
          }}
          className="rounded-2xl bg-[var(--forest)]/10 px-3 py-2 text-xs font-semibold text-[var(--forest)]"
        >
          Riempi foglio
        </button>
        <button
          type="button"
          onClick={() => {
            patchPrefs({ placements: autoPlaceZones(layoutZones), marks: prefs.marks });
            setSelectedZoneId(null);
            toast.success("Zone sistemate in automatico");
          }}
          className="rounded-2xl bg-[var(--forest)]/10 px-3 py-2 text-xs font-semibold text-[var(--forest)]"
        >
          Auto-disponi
        </button>
        <button
          type="button"
          onClick={() => setShowGuides((v) => !v)}
          className={`rounded-2xl px-3 py-2 text-xs font-semibold ${
            showGuides
              ? "bg-blue-600 text-white"
              : "bg-[var(--forest)]/10 text-[var(--forest)]"
          }`}
        >
          {showGuides ? "Limiti ON" : "Limiti OFF"}
        </button>
        <button
          type="button"
          onClick={() => {
            patchPrefs({ placements: [], marks: [] });
            setSelectedZoneId(null);
            setSelectedMarkId(null);
          }}
          className="rounded-2xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
        >
          Svuota lavagna
        </button>
      </div>

      <p className="text-[11px] text-[var(--forest-muted)]">
        Lavagna = foglio A4 verticale = ciò che vede lo <strong>Schermo</strong>{" "}
        (TV in verticale). Tratteggio blu = bordo TV/stampa; ambra = area sicura;
        rosso = riferimento da evitare (TV orizzontale). Zone e segni si
        agganciano alla griglia ogni {TABLE_GRID_SNAP}%.
      </p>

      <div
        ref={boardRef}
        onPointerDown={onBoardPointerDown}
        onPointerMove={onBoardPointerMove}
        onPointerUp={onBoardPointerUp}
        className="relative mx-auto aspect-[210/297] w-full max-h-[min(72dvh,900px)] touch-none overflow-hidden border-2 border-blue-500/40 bg-[linear-gradient(rgba(45,90,39,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(45,90,39,0.1)_1px,transparent_1px)] bg-white shadow-sm"
        style={{ backgroundSize: `${TABLE_GRID_SNAP}% ${TABLE_GRID_SNAP}%` }}
      >
        {showGuides ? <CartinaViewportGuides /> : null}

        <ZoneMarksLayer
          marks={visibleMarks}
          selectedId={selectedMarkId}
          interactive={tool === "move"}
          onSelect={(id) => {
            setSelectedMarkId(id);
            setSelectedZoneId(null);
            const m = prefs.marks.find((mark) => mark.id === id);
            if (m?.color) setColor(m.color);
          }}
          onDragStart={startMarkDrag}
        />

        {prefs.placements.map((p) => {
          const zone = layoutZones.find((z) => z.id === p.zoneId);
          if (!zone) return null;
          const selected = p.zoneId === selectedZoneId;
          const accent = zoneAccentColor(zone);
          return (
            <div
              key={p.zoneId}
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: `${p.w}%`,
                height: `${p.h}%`,
                borderColor: selected ? undefined : accent,
              }}
              className={`absolute z-10 flex flex-col overflow-hidden border-2 bg-white/95 ${
                selected ? "border-amber-500 shadow-lg" : ""
              }`}
              onPointerDown={(e) => startZoneDrag(e, p, "move")}
            >
              {!p.hideTitle ? (
                <div
                  className="shrink-0 px-0.5 py-0.5 text-center text-[9px] font-bold leading-none text-white sm:text-[10px]"
                  style={{ backgroundColor: accent }}
                >
                  {zone.name}
                </div>
              ) : null}
              <div
                className="flex min-h-0 flex-1 items-center justify-center px-0.5 text-[8px]"
                style={{ backgroundColor: `${accent}14`, color: accent }}
              >
                {zone.tables.length} tavoli
                {p.hideTitle ? (
                  <span className="ml-1 opacity-70">· {zone.name}</span>
                ) : null}
              </div>
              {selected && tool === "move" ? (
                <button
                  type="button"
                  aria-label="Ridimensiona"
                  className="absolute bottom-0 right-0 z-20 h-7 w-7 translate-x-1/3 translate-y-1/3 rounded-full border-2 border-white bg-amber-500 shadow"
                  onPointerDown={(e) => startZoneDrag(e, p, "resize")}
                />
              ) : null}
            </div>
          );
        })}

        {pendingZoneId ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 text-center text-xs font-semibold text-amber-800">
            Tocca dove mettere la zona
          </div>
        ) : null}
      </div>

      {selectedPlacement ? (
        <div className="space-y-2 rounded-2xl bg-white px-3 py-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[var(--forest-ink)]">
              {layoutZones.find((z) => z.id === selectedPlacement.zoneId)?.name}
            </p>
            <button
              type="button"
              onClick={() => removeZone(selectedPlacement.zoneId)}
              className="inline-flex items-center gap-1 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Togli dalla lavagna
            </button>
          </div>

          <GapModeRow
            label="Spazio orizzontale tra tavoli"
            value={selectedPlacement.tableGapX ?? "near"}
            onChange={(tableGapX) =>
              upsertPlacement({ ...selectedPlacement, tableGapX })
            }
          />
          <GapModeRow
            label="Spazio verticale tra tavoli"
            value={selectedPlacement.tableGapY ?? "near"}
            onChange={(tableGapY) =>
              upsertPlacement({ ...selectedPlacement, tableGapY })
            }
          />

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-[var(--forest)]/5 px-3 py-2.5">
            <span className="text-xs font-semibold text-[var(--forest-ink)]">
              Nascondi titolo (solo bordo)
            </span>
            <input
              type="checkbox"
              checked={selectedPlacement.hideTitle === true}
              onChange={(e) =>
                upsertPlacement({
                  ...selectedPlacement,
                  hideTitle: e.target.checked ? true : undefined,
                })
              }
              className="h-5 w-5 accent-[var(--forest)]"
            />
          </label>
        </div>
      ) : null}

      {selectedMark ? (
        <div className="space-y-2 rounded-2xl bg-white px-3 py-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[var(--forest-ink)]">
              {selectedMark.kind === "text"
                ? "Scritta"
                : selectedMark.kind === "line"
                  ? "Linea"
                  : "Rettangolo"}
              <span className="ml-2 text-xs font-normal text-[var(--forest-muted)]">
                trascina per spostare
              </span>
            </p>
            <button
              type="button"
              onClick={() => removeMark(selectedMark.id)}
              className="inline-flex items-center gap-1 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Elimina
            </button>
          </div>

          {selectedMark.kind === "text" ? (
            <>
              <button
                type="button"
                onClick={() => {
                  const text = window.prompt(
                    "Modifica testo",
                    selectedMark.text || "",
                  );
                  if (text == null) return;
                  updateMark(selectedMark.id, {
                    text: text.trim() || "Etichetta",
                  });
                }}
                className="w-full rounded-xl bg-[var(--forest)]/10 py-2 text-sm font-semibold text-[var(--forest)]"
              >
                Modifica testo: “{selectedMark.text}”
              </button>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[var(--forest-muted)]">
                  Dimensione
                </span>
                <button
                  type="button"
                  aria-label="Rimpicciolisci"
                  onClick={() => {
                    const cur =
                      selectedMark.fontSize ?? DEFAULT_MARK_FONT_SIZE;
                    updateMark(selectedMark.id, {
                      fontSize: Math.max(1.4, Math.round((cur - 0.4) * 10) / 10),
                    });
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--forest)]/10 text-[var(--forest)]"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="min-w-[3rem] text-center text-sm font-bold tabular-nums text-[var(--forest-ink)]">
                  {(selectedMark.fontSize ?? DEFAULT_MARK_FONT_SIZE).toFixed(1)}
                </span>
                <button
                  type="button"
                  aria-label="Ingrandisci"
                  onClick={() => {
                    const cur =
                      selectedMark.fontSize ?? DEFAULT_MARK_FONT_SIZE;
                    updateMark(selectedMark.id, {
                      fontSize: Math.min(14, Math.round((cur + 0.4) * 10) / 10),
                    });
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--forest)]/10 text-[var(--forest)]"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <span className="text-[11px] text-[var(--forest-muted)]">
                  o maniglia ambra
                </span>
              </div>
            </>
          ) : null}

          {selectedMark.kind === "rect" ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-[var(--forest-muted)]">
                Dimensione
              </span>
              <button
                type="button"
                onClick={() => {
                  const w = Math.max(4, (selectedMark.w ?? 10) - 2);
                  const h = Math.max(4, (selectedMark.h ?? 10) - 2);
                  updateMark(selectedMark.id, { w, h });
                }}
                className="flex h-10 items-center gap-1 rounded-xl bg-[var(--forest)]/10 px-3 text-sm font-semibold text-[var(--forest)]"
              >
                <Minus className="h-4 w-4" />
                Più piccolo
              </button>
              <button
                type="button"
                onClick={() => {
                  const w = Math.min(98, (selectedMark.w ?? 10) + 2);
                  const h = Math.min(98, (selectedMark.h ?? 10) + 2);
                  updateMark(selectedMark.id, { w, h });
                }}
                className="flex h-10 items-center gap-1 rounded-xl bg-[var(--forest)]/10 px-3 text-sm font-semibold text-[var(--forest)]"
              >
                <Plus className="h-4 w-4" />
                Più grande
              </button>
              <span className="text-[11px] text-[var(--forest-muted)]">
                o maniglia in basso a destra
              </span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-[var(--forest-muted)]">
              Colore
            </span>
            {CARTINA_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                title={c.label}
                onClick={() => {
                  setColor(c.hex);
                  updateMark(selectedMark.id, { color: c.hex });
                }}
                className={`h-8 w-8 rounded-full border-2 ${
                  (selectedMark.color || CARTINA_COLORS[0]!.hex) === c.hex
                    ? "scale-110 border-[var(--forest-ink)]"
                    : "border-white"
                }`}
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onPreview}
        disabled={prefs.placements.length === 0 || publishing}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--forest)] py-3.5 text-sm font-bold text-white disabled:opacity-50"
      >
        <Eye className="h-4 w-4" />
        {publishing ? "Pubblicazione…" : "Genera cartina"}
      </button>
    </div>
  );
}

function GapModeRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TableGapMode;
  onChange: (next: TableGapMode) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="min-w-[10rem] flex-1 text-xs font-semibold text-[var(--forest-muted)]">
        {label}
      </span>
      {(
        [
          { id: "near", label: "Vicini" },
          { id: "far", label: "Lontani" },
        ] as const
      ).map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            value === opt.id
              ? "bg-[var(--forest)] text-white"
              : "bg-[var(--forest)]/10 text-[var(--forest)]"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function StepTab({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Eye;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-2.5 text-sm font-semibold ${
        active
          ? "bg-[var(--forest)] text-white"
          : "bg-white/70 text-[var(--forest-ink)]"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function CartinaSheet({
  items,
  marks,
  reservations,
  title,
  subtitle,
}: {
  items: { zone: ZoneLayout; placement: ZoneOnBoard }[];
  marks: MapMark[];
  reservations: Reservation[];
  title: string;
  subtitle: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-[var(--forest)]/25 bg-white/60 px-6 py-16 text-center text-sm text-[var(--forest-muted)]">
        Nessuna zona sulla lavagna.
      </div>
    );
  }

  return (
    <div className="cartina-sheet mx-auto flex w-full flex-col bg-white shadow-sm aspect-[210/297] print:aspect-auto print:h-dvh print:max-w-none print:shadow-none">
      <div className="no-print shrink-0 px-2 py-1">
        <h3 className="font-[family-name:var(--font-display)] text-sm font-bold text-[var(--forest-ink)]">
          {title}
        </h3>
        <p className="text-xs text-[var(--forest-muted)]">{subtitle}</p>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden border border-[var(--forest)]/20 bg-white print:border-0">
        <ZoneMarksLayer marks={marks} />
        {items.map(({ zone, placement }) => {
          const guests = guestsByTable(reservations, zone.name);
          const accent = zoneAccentColor(zone);
          const { gapX, gapY } = gapsFromPlacement(placement);
          const rects = computeTableFillRects(zone.tables, gapX, gapY);
          return (
            <section
              key={zone.id}
              className="absolute flex flex-col overflow-hidden border bg-white"
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
                  className="shrink-0 px-0.5 py-px text-center text-[8px] font-bold leading-tight text-white print:text-[7pt]"
                  style={{ backgroundColor: accent }}
                >
                  {zone.name}
                </h4>
              ) : null}
              <div className="relative min-h-0 flex-1 bg-white">
                {rects.map(({ table, x, y, w, h }) => {
                  const tableGuests = guests.get(table.number) ?? [];
                  const occupied = tableGuests.length > 0;
                  return (
                    <div
                      key={table.id}
                      className="absolute flex items-center justify-center overflow-hidden text-center"
                      style={{
                        left: `${x}%`,
                        top: `${y}%`,
                        width: `${w}%`,
                        height: `${h}%`,
                        backgroundColor: occupied ? `${accent}18` : "#ffffff",
                        boxShadow: `inset 0 0 0 1px ${occupied ? accent : `${accent}55`}`,
                      }}
                    >
                      {!occupied ? (
                        <span
                          className="pointer-events-none absolute inset-0 flex items-start justify-end p-0.5 text-[6px] font-semibold print:text-[5pt]"
                          style={{ color: `${accent}66` }}
                        >
                          {table.number}
                        </span>
                      ) : null}
                      {occupied ? (
                        <span className="line-clamp-5 w-full px-0.5 text-[7px] font-bold leading-[1.05] text-[var(--forest-ink)] sm:text-[9px] print:text-[6.5pt]">
                          {formatTableGuests(tableGuests)}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
