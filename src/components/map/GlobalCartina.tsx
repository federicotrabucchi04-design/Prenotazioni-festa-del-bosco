"use client";

import { useEffect, useRef, useState } from "react";
import {
  Download,
  Eye,
  Minus,
  MousePointer2,
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
import { useUiStore } from "@/store/ui-store";
import { EVENT_DATE, createId } from "@/lib/constants";
import { downloadCartinaPng } from "@/lib/cartina-export";
import { ZoneMarksLayer } from "@/components/map/ZoneMarksLayer";
import type { MapMark, Reservation, ZoneLayout } from "@/lib/types";
import {
  type CartinaPrefs,
  type ZoneOnBoard,
  CARTINA_COLORS,
  DEFAULT_ZONE_H,
  DEFAULT_ZONE_W,
  MIN_ZONE_SIZE,
  autoPlaceZones,
  fillPagePlacements,
  formatTableGuests,
  guestsByTable,
  loadCartinaPrefs,
  normalizePlacement,
  placeZonesLikeCartina,
  placedZoneIds,
  pointerPercent,
  resolvePlacedZones,
  saveCartinaPrefs,
  sortedTables,
  tableGridColumns,
} from "@/lib/cartina";
import { saveOrderCartina } from "@/lib/order-board";
import { clampPercent } from "@/lib/layout-utils";

type Step = "arrange" | "preview";
type Tool = "move" | "line" | "rect" | "text";

export function GlobalCartina() {
  const open = useUiStore((s) => s.printMapOpen);
  const close = useUiStore((s) => s.closePrintMap);
  const { layout } = useVenueLayout();
  const { items } = useReservations();
  const { active } = useEvenings();
  const [step, setStep] = useState<Step>("arrange");
  const [prefs, setPrefs] = useState<CartinaPrefs | null>(null);

  useEffect(() => {
    if (!open) return;
    setPrefs(loadCartinaPrefs(layout));
    setStep("arrange");
  }, [open, layout]);

  const eveningLabel = active?.label ?? EVENT_DATE;
  const title = "Feste del Bosco — disposizione tavoli";
  const subtitle = `Sera del ${eveningLabel}`;

  if (!open) return null;

  const activePrefs = prefs ?? loadCartinaPrefs(layout);
  const placed = resolvePlacedZones(layout, activePrefs);

  function updatePrefs(next: CartinaPrefs) {
    setPrefs(next);
    saveCartinaPrefs(next);
    void saveOrderCartina(next).catch(() => {
      // sync best-effort verso schermo servizio
    });
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
              Trascina zone · linee e scritte colorate
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
            onClick={() => setStep("preview")}
          />
        </div>

        <div
          className={`min-h-0 flex-1 print:overflow-visible ${
            step === "preview" ? "overflow-hidden" : "overflow-y-auto"
          }`}
        >
          {step === "arrange" ? (
            <CartinaArrangeBoard
              layoutZones={layout.zones}
              prefs={activePrefs}
              onChange={updatePrefs}
              onPreview={() => setStep("preview")}
            />
          ) : (
            <div className="cartina-print-root flex h-full min-h-0 w-full items-stretch justify-center print:block">
              <CartinaSheet
                items={placed}
                marks={activePrefs.marks}
                reservations={items}
                title={title}
                subtitle={subtitle}
              />
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
                onClick={() => setStep("preview")}
                disabled={placed.length === 0}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--forest)] py-3.5 text-sm font-bold text-white disabled:opacity-50"
              >
                <Eye className="h-4 w-4" />
                Vai all’anteprima
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
}: {
  layoutZones: ZoneLayout[];
  prefs: CartinaPrefs;
  onChange: (next: CartinaPrefs) => void;
  onPreview: () => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>("move");
  const [color, setColor] = useState<string>(CARTINA_COLORS[0]!.hex);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectedMarkId, setSelectedMarkId] = useState<string | null>(null);
  const [pendingZoneId, setPendingZoneId] = useState<string | null>(null);
  const [draftMark, setDraftMark] = useState<MapMark | null>(null);
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const drag = useRef<{
    zoneId: string;
    mode: "move" | "resize";
    ox: number;
    oy: number;
    start: ZoneOnBoard;
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

  function onBoardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!boardRef.current) return;
    const { x, y } = pointerPercent(e, boardRef.current);

    if (pendingZoneId && tool === "move") {
      upsertPlacement({
        zoneId: pendingZoneId,
        x: clampPercent(x - DEFAULT_ZONE_W / 2),
        y: clampPercent(y - DEFAULT_ZONE_H / 2),
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
    const { x, y } = pointerPercent(e, boardRef.current);

    if (drag.current) {
      const d = drag.current;
      if (d.mode === "move") {
        upsertPlacement({
          ...d.start,
          x: clampPercent(d.start.x + (x - d.ox)),
          y: clampPercent(d.start.y + (y - d.oy)),
        });
      } else {
        upsertPlacement({
          ...d.start,
          w: Math.max(MIN_ZONE_SIZE, x - d.start.x),
          h: Math.max(MIN_ZONE_SIZE, y - d.start.y),
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
          Colore
        </span>
        {CARTINA_COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            title={c.label}
            onClick={() => {
              setColor(c.hex);
              if (selectedMarkId) updateMark(selectedMarkId, { color: c.hex });
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
        Lavagna = foglio A4 verticale. Usa tutto lo spazio: trascina i bordi delle
        zone fino ai margini.
      </p>

      <div
        ref={boardRef}
        onPointerDown={onBoardPointerDown}
        onPointerMove={onBoardPointerMove}
        onPointerUp={onBoardPointerUp}
        className="relative mx-auto aspect-[210/297] w-full max-h-[min(72dvh,900px)] touch-none overflow-hidden border border-[var(--forest)]/20 bg-[linear-gradient(rgba(45,90,39,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(45,90,39,0.05)_1px,transparent_1px)] bg-size-[16px_16px] bg-white shadow-sm"
      >
        <ZoneMarksLayer
          marks={visibleMarks}
          selectedId={selectedMarkId}
          interactive={tool === "move"}
          onSelect={(id) => {
            setSelectedMarkId(id);
            setSelectedZoneId(null);
          }}
        />

        {prefs.placements.map((p) => {
          const zone = layoutZones.find((z) => z.id === p.zoneId);
          if (!zone) return null;
          const selected = p.zoneId === selectedZoneId;
          return (
            <div
              key={p.zoneId}
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: `${p.w}%`,
                height: `${p.h}%`,
              }}
              className={`absolute z-10 flex flex-col overflow-hidden border-2 bg-white/95 ${
                selected
                  ? "border-amber-500 shadow-lg"
                  : "border-[var(--forest)]"
              }`}
              onPointerDown={(e) => startZoneDrag(e, p, "move")}
            >
              <div className="shrink-0 bg-[var(--forest)] px-0.5 py-0.5 text-center text-[9px] font-bold leading-none text-white sm:text-[10px]">
                {zone.name}
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--forest)]/5 px-0.5 text-[8px] text-[var(--forest-muted)]">
                {zone.tables.length} tavoli
              </div>
              {selected && tool === "move" ? (
                <button
                  type="button"
                  aria-label="Ridimensiona"
                  className="absolute bottom-0 right-0 z-20 h-5 w-5 translate-x-1/4 translate-y-1/4 rounded-full border-2 border-white bg-amber-500"
                  onPointerDown={(e) => startZoneDrag(e, p, "resize")}
                />
              ) : null}
            </div>
          );
        })}

        {pendingZoneId ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs font-semibold text-amber-800">
            Tocca dove mettere la zona
          </div>
        ) : null}
      </div>

      {selectedPlacement ? (
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2 shadow-sm">
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
            <button
              type="button"
              onClick={() => {
                const text = window.prompt("Modifica testo", selectedMark.text || "");
                if (text == null) return;
                updateMark(selectedMark.id, { text: text.trim() || "Etichetta" });
              }}
              className="w-full rounded-xl bg-[var(--forest)]/10 py-2 text-sm font-semibold text-[var(--forest)]"
            >
              Modifica testo: “{selectedMark.text}”
            </button>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={onPreview}
        disabled={prefs.placements.length === 0}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--forest)] py-3.5 text-sm font-bold text-white disabled:opacity-50"
      >
        <Eye className="h-4 w-4" />
        Genera cartina
      </button>
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
    <div className="cartina-sheet cartina-a4-portrait mx-auto flex h-full min-h-0 w-full max-w-[min(100%,calc((100dvh-8rem)*210/297))] flex-col bg-white print:max-w-none print:h-dvh">
      <div className="no-print shrink-0 px-2 py-1">
        <h3 className="font-[family-name:var(--font-display)] text-sm font-bold text-[var(--forest-ink)]">
          {title}
        </h3>
        <p className="text-xs text-[var(--forest-muted)]">{subtitle}</p>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden border border-[var(--forest)]/20 bg-white print:border-0">
        <ZoneMarksLayer marks={marks} />
        {items.map(({ zone, placement }) => {
          const tables = sortedTables(zone);
          const guests = guestsByTable(reservations, zone.name);
          const tCols = tableGridColumns(tables.length);
          return (
            <section
              key={zone.id}
              className="absolute flex flex-col overflow-hidden border border-[var(--forest)] bg-white"
              style={{
                left: `${placement.x}%`,
                top: `${placement.y}%`,
                width: `${placement.w}%`,
                height: `${placement.h}%`,
              }}
            >
              <h4 className="shrink-0 bg-[var(--forest)] px-0.5 py-px text-center text-[8px] font-bold leading-tight text-white print:text-[7pt]">
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
                  const tableGuests = guests.get(table.number) ?? [];
                  const occupied = tableGuests.length > 0;
                  return (
                    <div
                      key={table.id}
                      className={`relative flex items-center justify-center overflow-hidden text-center ${
                        occupied
                          ? "bg-[#f7faf7] text-[var(--forest-ink)]"
                          : "bg-white"
                      }`}
                    >
                      {!occupied ? (
                        <span className="pointer-events-none absolute inset-0 flex items-start justify-end p-0.5 text-[6px] font-semibold text-[var(--forest)]/35 print:text-[5pt]">
                          {table.number}
                        </span>
                      ) : null}
                      {occupied ? (
                        <span className="line-clamp-5 w-full px-0.5 text-[7px] font-bold leading-[1.05] sm:text-[9px] print:text-[6.5pt]">
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
