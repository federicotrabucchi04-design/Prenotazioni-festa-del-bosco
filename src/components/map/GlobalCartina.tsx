"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  Printer,
  Settings2,
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
import {
  type CartinaColumns,
  type CartinaPrefs,
  loadCartinaPrefs,
  namesByTable,
  orderedVisibleZones,
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
  const visibleZones = orderedVisibleZones(layout, activePrefs);

  function updatePrefs(next: CartinaPrefs) {
    setPrefs(next);
    saveCartinaPrefs(next);
  }

  function moveZone(id: string, dir: -1 | 1) {
    const order = [...activePrefs.zoneOrder];
    const i = order.indexOf(id);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
    updatePrefs({ ...activePrefs, zoneOrder: order });
  }

  function toggleZone(id: string) {
    const hidden = new Set(activePrefs.hiddenZoneIds);
    if (hidden.has(id)) hidden.delete(id);
    else hidden.add(id);
    updatePrefs({ ...activePrefs, hiddenZoneIds: [...hidden] });
  }

  function handleDownload() {
    if (visibleZones.length === 0) {
      toast.error("Seleziona almeno una zona");
      return;
    }
    downloadCartinaPng({
      zones: visibleZones,
      columns: activePrefs.columns,
      reservations: items,
      title,
      subtitle,
    });
    toast.success("Cartina scaricata (PNG)");
  }

  function handlePrint() {
    if (visibleZones.length === 0) {
      toast.error("Seleziona almeno una zona");
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
                {step === "arrange" ? "Disponi le zone" : "Anteprima per cassa"}
              </h2>
              <p className="text-sm text-[var(--forest-muted)]">
                Solo nomi sui tavoli occupati · stampabile
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
                    Colonne sulla cartina
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {([1, 2, 3, 4] as CartinaColumns[]).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => updatePrefs({ ...activePrefs, columns: c })}
                        className={`rounded-2xl py-3 text-sm font-bold transition active:scale-95 ${
                          activePrefs.columns === c
                            ? "bg-[var(--forest)] text-white"
                            : "bg-[var(--forest)]/8 text-[var(--forest)]"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-[var(--forest-muted)]">
                    Es. 2 = zone affiancate a due a due; 1 = una sotto l’altra.
                  </p>
                </section>

                <section className="rounded-3xl border border-white/70 bg-white/80 p-4">
                  <p className="mb-3 text-sm font-semibold text-[var(--forest-ink)]">
                    Ordine e zone da includere
                  </p>
                  <ul className="space-y-2">
                    {activePrefs.zoneOrder.map((id) => {
                      const zone = layout.zones.find((z) => z.id === id);
                      if (!zone) return null;
                      const hidden = activePrefs.hiddenZoneIds.includes(id);
                      return (
                        <li
                          key={id}
                          className={`flex items-center gap-2 rounded-2xl border px-3 py-2 ${
                            hidden
                              ? "border-transparent bg-[var(--forest)]/5 opacity-55"
                              : "border-[var(--forest)]/10 bg-white"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={!hidden}
                            onChange={() => toggleZone(id)}
                            className="h-5 w-5 accent-[var(--forest)]"
                            aria-label={`Includi ${zone.name}`}
                          />
                          <span className="min-w-0 flex-1 truncate font-medium text-[var(--forest-ink)]">
                            {zone.name}
                            <span className="ml-2 text-xs text-[var(--forest-muted)]">
                              {zone.tables.length} tavoli
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => moveZone(id, -1)}
                            className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--forest)]/8 text-[var(--forest)]"
                            aria-label="Sposta su"
                          >
                            <ChevronUp className="h-5 w-5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveZone(id, 1)}
                            className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--forest)]/8 text-[var(--forest)]"
                            aria-label="Sposta giù"
                          >
                            <ChevronDown className="h-5 w-5" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>

                <button
                  type="button"
                  onClick={() => setStep("preview")}
                  disabled={visibleZones.length === 0}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--forest)] py-3.5 text-sm font-bold text-white shadow-md shadow-[var(--forest)]/25 disabled:opacity-50"
                >
                  <Eye className="h-4 w-4" />
                  Genera cartina
                </button>
              </div>
            ) : (
              <div className="cartina-print-root px-3 py-3 pb-28 print:p-0 print:pb-0">
                <CartinaSheet
                  zones={visibleZones}
                  columns={activePrefs.columns}
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
                  disabled={visibleZones.length === 0}
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
  zones,
  columns,
  reservations,
  title,
  subtitle,
}: {
  zones: ReturnType<typeof orderedVisibleZones>;
  columns: CartinaColumns;
  reservations: import("@/lib/types").Reservation[];
  title: string;
  subtitle: string;
}) {
  if (zones.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-[var(--forest)]/25 bg-white/60 px-6 py-16 text-center text-sm text-[var(--forest-muted)]">
        Nessuna zona selezionata.
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
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gridAutoRows: "1fr",
        }}
      >
        {zones.map((zone) => {
          const tables = sortedTables(zone);
          const names = namesByTable(reservations, zone.name);
          const tCols = tableGridColumns(tables.length);
          return (
            <section
              key={zone.id}
              className="flex min-h-[180px] flex-col overflow-hidden rounded-xl border-2 border-[var(--forest)] print:min-h-0 print:rounded-md"
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
                  const guestNames = names.get(table.number) ?? [];
                  const occupied = guestNames.length > 0;
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
                          {guestNames.join(" · ")}
                        </span>
                      ) : (
                        <span aria-hidden className="select-none text-[10px] text-[var(--forest)]/15">
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
