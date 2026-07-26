"use client";

import { useEffect, useState } from "react";
import {
  Download,
  Eye,
  Minus,
  Plus,
  Printer,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import toast from "react-hot-toast";
import { useVenueLayout } from "@/hooks/use-venue-layout";
import { useReservations } from "@/hooks/use-reservations";
import { useEvenings } from "@/hooks/use-evenings";
import { useUiStore } from "@/store/ui-store";
import { EVENT_DATE } from "@/lib/constants";
import { downloadCartinaPng } from "@/lib/cartina-export";
import type { Reservation, ZoneLayout } from "@/lib/types";
import {
  type CartinaPrefs,
  type ZonePlacement,
  SPAN_PRESETS,
  clampGrid,
  formatTableGuests,
  guestsByTable,
  loadCartinaPrefs,
  MAX_GRID,
  MIN_GRID,
  normalizePlacement,
  placedZoneIds,
  placementFits,
  resolvePlacedZones,
  saveCartinaPrefs,
  sortedTables,
  tableGridColumns,
} from "@/lib/cartina";

type Step = "arrange" | "preview";

export function GlobalCartina() {
  const open = useUiStore((s) => s.printMapOpen);
  const close = useUiStore((s) => s.closePrintMap);
  const { layout } = useVenueLayout();
  const { items } = useReservations();
  const { active } = useEvenings();
  const [step, setStep] = useState<Step>("arrange");
  const [prefs, setPrefs] = useState<CartinaPrefs | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPrefs(loadCartinaPrefs(layout));
    setStep("arrange");
    setSelectedZoneId(null);
  }, [open, layout]);

  const eveningLabel = active?.label ?? EVENT_DATE;
  const title = "Feste del Bosco — disposizione tavoli";
  const subtitle = `Sera del ${eveningLabel}`;

  if (!open) return null;

  const activePrefs = prefs ?? loadCartinaPrefs(layout);
  const placed = resolvePlacedZones(layout, activePrefs);
  const placedIds = placedZoneIds(activePrefs);
  const unplaced = layout.zones.filter((z) => !placedIds.has(z.id));

  function updatePrefs(next: CartinaPrefs) {
    setPrefs(next);
    saveCartinaPrefs(next);
  }

  function setGridSize(rows: number, cols: number) {
    const gridRows = clampGrid(rows);
    const gridCols = clampGrid(cols);
    const placements = activePrefs.placements
      .map((p) => normalizePlacement(p, gridRows, gridCols))
      .filter((p, _, arr) =>
        placementFits(p, arr, gridRows, gridCols),
      );
    // Re-filter collisions after shrink
    const cleaned: ZonePlacement[] = [];
    for (const p of placements) {
      if (placementFits(p, cleaned, gridRows, gridCols)) cleaned.push(p);
    }
    updatePrefs({ gridRows, gridCols, placements: cleaned });
  }

  function placeOrMove(row: number, col: number) {
    if (!selectedZoneId) {
      // Se c'è già una zona nella cella, selezionala
      const hit = activePrefs.placements.find((p) =>
        cellsOf(p).some((k) => k === `${row}:${col}`),
      );
      if (hit) setSelectedZoneId(hit.zoneId);
      return;
    }

    const existing = activePrefs.placements.find(
      (p) => p.zoneId === selectedZoneId,
    );
    const candidate: ZonePlacement = {
      zoneId: selectedZoneId,
      row,
      col,
      rowSpan: existing?.rowSpan ?? 1,
      colSpan: existing?.colSpan ?? 1,
    };
    const without = activePrefs.placements.filter(
      (p) => p.zoneId !== selectedZoneId,
    );

    // Se la cella è occupata da un'altra zona, scambia le posizioni di origine
    const occupant = without.find((p) =>
      cellsOf(p).includes(`${row}:${col}`),
    );
    if (occupant && existing) {
      const swappedOcc: ZonePlacement = {
        ...occupant,
        row: existing.row,
        col: existing.col,
      };
      const swappedSel: ZonePlacement = {
        ...existing,
        row: occupant.row,
        col: occupant.col,
      };
      const rest = without.filter((p) => p.zoneId !== occupant.zoneId);
      if (
        placementFits(swappedSel, [...rest, swappedOcc], activePrefs.gridRows, activePrefs.gridCols) &&
        placementFits(swappedOcc, [...rest, swappedSel], activePrefs.gridRows, activePrefs.gridCols)
      ) {
        updatePrefs({
          ...activePrefs,
          placements: [...rest, swappedSel, swappedOcc],
        });
        return;
      }
    }

    const fitted = normalizePlacement(
      candidate,
      activePrefs.gridRows,
      activePrefs.gridCols,
    );
    if (!placementFits(fitted, without, activePrefs.gridRows, activePrefs.gridCols)) {
      toast.error("Non c’è spazio qui (prova una cella libera o riduci la misura)");
      return;
    }
    updatePrefs({
      ...activePrefs,
      placements: [...without, fitted],
    });
  }

  function removePlacement(zoneId: string) {
    updatePrefs({
      ...activePrefs,
      placements: activePrefs.placements.filter((p) => p.zoneId !== zoneId),
    });
    if (selectedZoneId === zoneId) setSelectedZoneId(null);
  }

  function setSpan(zoneId: string, rowSpan: number, colSpan: number) {
    const current = activePrefs.placements.find((p) => p.zoneId === zoneId);
    if (!current) return;
    const candidate = { ...current, rowSpan, colSpan };
    const without = activePrefs.placements.filter((p) => p.zoneId !== zoneId);
    const fitted = normalizePlacement(
      candidate,
      activePrefs.gridRows,
      activePrefs.gridCols,
    );
    if (!placementFits(fitted, without, activePrefs.gridRows, activePrefs.gridCols)) {
      toast.error("Misura troppo grande per questa posizione");
      return;
    }
    updatePrefs({
      ...activePrefs,
      placements: [...without, fitted],
    });
  }

  function autoFill() {
    const next = {
      ...activePrefs,
      placements: [] as ZonePlacement[],
    };
    const zones = layout.zones;
    let i = 0;
    for (let r = 0; r < activePrefs.gridRows && i < zones.length; r++) {
      for (let c = 0; c < activePrefs.gridCols && i < zones.length; c++) {
        const zone = zones[i]!;
        const p: ZonePlacement = {
          zoneId: zone.id,
          row: r,
          col: c,
          rowSpan: 1,
          colSpan: 1,
        };
        if (placementFits(p, next.placements, next.gridRows, next.gridCols)) {
          next.placements.push(p);
          i++;
        }
      }
    }
    updatePrefs(next);
    toast.success("Zone disposte automaticamente");
  }

  function clearBoard() {
    updatePrefs({ ...activePrefs, placements: [] });
    setSelectedZoneId(null);
  }

  function handleDownload() {
    if (placed.length === 0) {
      toast.error("Posiziona almeno una zona sulla griglia");
      return;
    }
    downloadCartinaPng({
      items: placed,
      gridRows: activePrefs.gridRows,
      gridCols: activePrefs.gridCols,
      reservations: items,
      title,
      subtitle,
    });
    toast.success("Cartina scaricata (PNG)");
  }

  function handlePrint() {
    if (placed.length === 0) {
      toast.error("Posiziona almeno una zona sulla griglia");
      return;
    }
    setStep("preview");
    window.setTimeout(() => window.print(), 180);
  }

  const selectedPlacement = selectedZoneId
    ? activePrefs.placements.find((p) => p.zoneId === selectedZoneId)
    : null;
  const selectedZone = selectedZoneId
    ? layout.zones.find((z) => z.id === selectedZoneId)
    : null;

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
              {step === "arrange" ? "Disponi le zone" : "Anteprima per cassa"}
            </h2>
            <p className="text-sm text-[var(--forest-muted)]">
              Nome + persone · libera disposizione
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
            label="Disposizione"
            onClick={() => setStep("arrange")}
          />
          <StepTab
            active={step === "preview"}
            icon={Eye}
            label="Anteprima"
            onClick={() => setStep("preview")}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto print:overflow-visible">
          {step === "arrange" ? (
            <div className="mx-auto max-w-lg space-y-4 px-4 py-4 pb-28">
              <section className="rounded-3xl border border-white/70 bg-white/80 p-4">
                <p className="mb-3 text-sm font-semibold text-[var(--forest-ink)]">
                  Dimensione griglia
                </p>
                <div className="flex items-center justify-between gap-3">
                  <GridStepper
                    label="Righe"
                    value={activePrefs.gridRows}
                    onChange={(v) => setGridSize(v, activePrefs.gridCols)}
                  />
                  <span className="text-lg font-bold text-[var(--forest-muted)]">
                    ×
                  </span>
                  <GridStepper
                    label="Colonne"
                    value={activePrefs.gridCols}
                    onChange={(v) => setGridSize(activePrefs.gridRows, v)}
                  />
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={autoFill}
                    className="flex-1 rounded-2xl bg-[var(--forest)]/10 py-2.5 text-sm font-semibold text-[var(--forest)]"
                  >
                    Auto-riempi
                  </button>
                  <button
                    type="button"
                    onClick={clearBoard}
                    className="rounded-2xl bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700"
                  >
                    Svuota
                  </button>
                </div>
              </section>

              <section className="rounded-3xl border border-white/70 bg-white/80 p-4">
                <p className="mb-2 text-sm font-semibold text-[var(--forest-ink)]">
                  Zone da posizionare
                </p>
                <p className="mb-3 text-xs text-[var(--forest-muted)]">
                  Tocca una zona, poi tocca una cella della griglia. Tocca di nuovo
                  una zona piazzata per cambiare misura o toglierla.
                </p>
                <div className="flex flex-wrap gap-2">
                  {layout.zones.map((z) => {
                    const isPlaced = placedIds.has(z.id);
                    const selected = selectedZoneId === z.id;
                    return (
                      <button
                        key={z.id}
                        type="button"
                        onClick={() =>
                          setSelectedZoneId((cur) => (cur === z.id ? null : z.id))
                        }
                        className={`rounded-full px-3 py-2 text-sm font-semibold transition active:scale-95 ${
                          selected
                            ? "bg-[var(--forest)] text-white ring-2 ring-[var(--forest)] ring-offset-2"
                            : isPlaced
                              ? "bg-[var(--forest)]/15 text-[var(--forest)]"
                              : "bg-white text-[var(--forest-ink)] shadow-sm"
                        }`}
                      >
                        {z.name}
                        {isPlaced ? " ✓" : ""}
                      </button>
                    );
                  })}
                </div>
                {unplaced.length > 0 ? (
                  <p className="mt-2 text-xs text-amber-800">
                    Ancora fuori griglia: {unplaced.map((z) => z.name).join(", ")}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-[var(--forest)]">
                    Tutte le zone sono sulla griglia.
                  </p>
                )}
              </section>

              <section className="rounded-3xl border border-white/70 bg-white/80 p-4">
                <p className="mb-3 text-sm font-semibold text-[var(--forest-ink)]">
                  Griglia disposizione
                  {selectedZone ? (
                    <span className="ml-2 font-normal text-[var(--forest-muted)]">
                      · {selectedZone.name}
                    </span>
                  ) : null}
                </p>
                <div
                  className="grid gap-2"
                  style={{
                    gridTemplateColumns: `repeat(${activePrefs.gridCols}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${activePrefs.gridRows}, minmax(4.5rem, 1fr))`,
                  }}
                >
                  <LayoutBoardCells
                    prefs={activePrefs}
                    layoutZones={layout.zones}
                    selectedZoneId={selectedZoneId}
                    onCell={placeOrMove}
                  />
                </div>
                <p className="mt-2 text-xs text-[var(--forest-muted)]">
                  Celle vuote = spazio libero sulla cartina. Puoi lasciare buchi.
                </p>
              </section>

              {selectedPlacement && selectedZone ? (
                <section className="rounded-3xl border border-[var(--forest)]/20 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[var(--forest-ink)]">
                      {selectedZone.name}
                    </p>
                    <button
                      type="button"
                      onClick={() => removePlacement(selectedZone.id)}
                      className="inline-flex items-center gap-1 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Togli
                    </button>
                  </div>
                  <p className="mb-2 text-xs text-[var(--forest-muted)]">
                    Quanto spazio occupa sulla cartina
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {SPAN_PRESETS.filter(
                      (s) =>
                        s.rowSpan <= activePrefs.gridRows &&
                        s.colSpan <= activePrefs.gridCols,
                    ).map((s) => {
                      const active =
                        selectedPlacement.rowSpan === s.rowSpan &&
                        selectedPlacement.colSpan === s.colSpan;
                      return (
                        <button
                          key={s.label}
                          type="button"
                          onClick={() =>
                            setSpan(selectedZone.id, s.rowSpan, s.colSpan)
                          }
                          className={`rounded-full px-3 py-2 text-sm font-bold ${
                            active
                              ? "bg-[var(--forest)] text-white"
                              : "bg-[var(--forest)]/10 text-[var(--forest)]"
                          }`}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              <button
                type="button"
                onClick={() => setStep("preview")}
                disabled={placed.length === 0}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--forest)] py-3.5 text-sm font-bold text-white shadow-md shadow-[var(--forest)]/25 disabled:opacity-50"
              >
                <Eye className="h-4 w-4" />
                Genera cartina
              </button>
            </div>
          ) : (
            <div className="cartina-print-root px-3 py-3 pb-28 print:p-0 print:pb-0">
              <CartinaSheet
                items={placed}
                gridRows={activePrefs.gridRows}
                gridCols={activePrefs.gridCols}
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

function cellsOf(p: ZonePlacement): string[] {
  const keys: string[] = [];
  for (let r = p.row; r < p.row + p.rowSpan; r++) {
    for (let c = p.col; c < p.col + p.colSpan; c++) {
      keys.push(`${r}:${c}`);
    }
  }
  return keys;
}

function GridStepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1">
      <span className="text-xs font-medium text-[var(--forest-muted)]">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(MIN_GRID, value - 1))}
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--forest)]/10 text-[var(--forest)]"
          aria-label={`Diminuisci ${label}`}
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-8 text-center text-xl font-bold text-[var(--forest-ink)]">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(MAX_GRID, value + 1))}
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--forest)]/10 text-[var(--forest)]"
          aria-label={`Aumenta ${label}`}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
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

function LayoutBoardCells({
  prefs,
  layoutZones,
  selectedZoneId,
  onCell,
}: {
  prefs: CartinaPrefs;
  layoutZones: ZoneLayout[];
  selectedZoneId: string | null;
  onCell: (row: number, col: number) => void;
}) {
  const coveredBySpan = new Set<string>();
  for (const p of prefs.placements) {
    for (const k of cellsOf(p)) {
      if (k !== `${p.row}:${p.col}`) coveredBySpan.add(k);
    }
  }

  const cells: React.ReactNode[] = [];
  for (let row = 0; row < prefs.gridRows; row++) {
    for (let col = 0; col < prefs.gridCols; col++) {
      const key = `${row}:${col}`;
      if (coveredBySpan.has(key)) continue;

      const cover = prefs.placements.find((p) => p.row === row && p.col === col);
      const zone = cover
        ? layoutZones.find((z) => z.id === cover.zoneId)
        : null;
      const selectedHere = cover?.zoneId === selectedZoneId;

      cells.push(
        <button
          key={key}
          type="button"
          onClick={() => onCell(row, col)}
          style={
            cover
              ? {
                  gridRow: `${row + 1} / span ${cover.rowSpan}`,
                  gridColumn: `${col + 1} / span ${cover.colSpan}`,
                }
              : {
                  gridRow: row + 1,
                  gridColumn: col + 1,
                }
          }
          className={`flex min-h-[4.5rem] flex-col items-center justify-center rounded-xl border-2 px-2 py-2 text-center transition active:scale-[0.98] ${
            cover
              ? selectedHere
                ? "border-[var(--forest)] bg-[var(--forest)] text-white shadow-md"
                : "border-[var(--forest)]/40 bg-[var(--forest)]/12 text-[var(--forest-ink)]"
              : selectedZoneId
                ? "border-[var(--forest)]/40 border-dashed bg-[var(--forest)]/5 text-[var(--forest-muted)]"
                : "border-[var(--forest)]/15 border-dashed bg-white/70 text-[var(--forest-muted)]"
          }`}
        >
          {zone && cover ? (
            <>
              <span className="text-sm font-bold leading-tight">{zone.name}</span>
              <span
                className={`mt-1 text-[10px] ${
                  selectedHere ? "text-white/80" : "opacity-70"
                }`}
              >
                {cover.colSpan}×{cover.rowSpan}
              </span>
            </>
          ) : (
            <span className="text-xs">
              {selectedZoneId ? "Posiziona qui" : "Vuota"}
            </span>
          )}
        </button>,
      );
    }
  }
  return cells;
}

function CartinaSheet({
  items,
  gridRows,
  gridCols,
  reservations,
  title,
  subtitle,
}: {
  items: { zone: ZoneLayout; placement: ZonePlacement }[];
  gridRows: number;
  gridCols: number;
  reservations: Reservation[];
  title: string;
  subtitle: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-[var(--forest)]/25 bg-white/60 px-6 py-16 text-center text-sm text-[var(--forest-muted)]">
        Nessuna zona sulla griglia.
      </div>
    );
  }

  return (
    <div className="cartina-sheet mx-auto flex min-h-[70vh] max-w-6xl flex-col bg-white print:min-h-0 print:max-w-none">
      <div className="mb-2 shrink-0 px-1 print:mb-1 print:px-0">
        <h3 className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--forest-ink)] print:text-base">
          {title}
        </h3>
        <p className="text-sm text-[var(--forest-muted)] print:text-xs">{subtitle}</p>
      </div>
      <div
        className="grid min-h-0 flex-1 gap-2 print:gap-1.5"
        style={{
          gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${gridRows}, minmax(0, 1fr))`,
        }}
      >
        {items.map(({ zone, placement }) => {
          const tables = sortedTables(zone);
          const guests = guestsByTable(reservations, zone.name);
          const tCols = tableGridColumns(tables.length);
          return (
            <section
              key={zone.id}
              className="flex min-h-0 flex-col overflow-hidden rounded-xl border-2 border-[var(--forest)] print:rounded-md"
              style={{
                gridRow: `${placement.row + 1} / span ${placement.rowSpan}`,
                gridColumn: `${placement.col + 1} / span ${placement.colSpan}`,
              }}
            >
              <h4 className="shrink-0 bg-[var(--forest)] px-2 py-1.5 text-center text-sm font-bold text-white print:py-1 print:text-xs">
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
                  const tableGuests = guests.get(table.number) ?? [];
                  const occupied = tableGuests.length > 0;
                  return (
                    <div
                      key={table.id}
                      className={`flex items-center justify-center overflow-hidden px-1 py-1 text-center ${
                        occupied
                          ? "bg-[#f7faf7] text-[var(--forest-ink)]"
                          : "bg-white text-transparent"
                      }`}
                    >
                      {occupied ? (
                        <span className="line-clamp-4 w-full text-[11px] font-bold leading-tight print:text-[9px] sm:text-xs">
                          {formatTableGuests(tableGuests)}
                        </span>
                      ) : (
                        <span
                          aria-hidden
                          className="select-none text-[10px] text-[var(--forest)]/15"
                        >
                          ·
                        </span>
                      )}
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
