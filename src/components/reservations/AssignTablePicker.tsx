"use client";

import { useMemo, useState } from "react";
import { X, MapPinned } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useUiStore } from "@/store/ui-store";
import { useVenueLayout } from "@/hooks/use-venue-layout";
import { useReservations } from "@/hooks/use-reservations";
import { getZoneByName } from "@/lib/layout-utils";
import { ZoneMarksLayer } from "@/components/map/ZoneMarksLayer";
import { ZoneTabsBar } from "@/components/ZoneTabsBar";
import { CapacityOverrideDialog } from "@/components/CapacityOverrideDialog";
import {
  CapacityExceededError,
  upsertReservation,
} from "@/lib/reservations";
import type { CapacityCheck } from "@/lib/types";
import toast from "react-hot-toast";

export function AssignTablePicker() {
  const assigning = useUiStore((s) => s.assigning);
  const closeAssignTable = useUiStore((s) => s.closeAssignTable);
  const selectedZone = useUiStore((s) => s.selectedZone);
  const setSelectedZone = useUiStore((s) => s.setSelectedZone);
  const { layout } = useVenueLayout();
  const { items } = useReservations();
  const [busy, setBusy] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [pendingCheck, setPendingCheck] = useState<CapacityCheck | null>(null);
  const [pendingTable, setPendingTable] = useState<number | null>(null);

  const zone = getZoneByName(layout, selectedZone) ?? layout.zones[0] ?? null;
  const marks = zone?.marks ?? [];

  const byTable = useMemo(() => {
    const map = new Map<number, { people: number; names: string[] }>();
    if (!zone || !assigning) return map;
    for (const r of items) {
      if (r.zone !== zone.name || !r.tableNumber || r.id === assigning.id) continue;
      const cur = map.get(r.tableNumber) ?? { people: 0, names: [] };
      cur.people += r.total;
      cur.names.push(r.name);
      map.set(r.tableNumber, cur);
    }
    return map;
  }, [items, zone, assigning]);

  async function assign(tableNumber: number, allowOverCapacity = false) {
    if (!assigning || !zone) return;
    setBusy(true);
    try {
      await upsertReservation({
        id: assigning.id,
        name: assigning.name,
        phone: assigning.phone,
        adults: assigning.adults,
        children: assigning.children,
        notes: assigning.notes,
        zone: zone.name,
        tableNumber,
        arrived: assigning.arrived,
        date: assigning.date,
        allowOverCapacity,
      });
      toast.success(
        `${assigning.name} → ${zone.name}, tavolo ${tableNumber}`,
      );
      setOverrideOpen(false);
      setPendingCheck(null);
      setPendingTable(null);
      closeAssignTable();
    } catch (err) {
      if (err instanceof CapacityExceededError) {
        setPendingCheck(err.check);
        setPendingTable(tableNumber);
        setOverrideOpen(true);
      } else {
        toast.error(err instanceof Error ? err.message : "Errore assegnazione");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AnimatePresence>
        {assigning ? (
          <motion.div
            className="fixed inset-0 z-50 flex flex-col bg-[var(--forest-bg)]"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: "spring", stiffness: 280, damping: 28 }}
          >
            <header className="flex items-start justify-between gap-3 border-b border-white/50 bg-white/75 px-4 pb-3 pt-[max(0.85rem,env(safe-area-inset-top))] backdrop-blur-xl">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--forest)]">
                  <MapPinned className="h-3.5 w-3.5" />
                  Assegna tavolo
                </p>
                <h2 className="truncate text-lg font-semibold text-[var(--forest-ink)]">
                  {assigning.name}
                </h2>
                <p className="text-sm text-[var(--forest-muted)]">
                  {assigning.total} persone · scegli zona e tocca un tavolo
                </p>
              </div>
              <button
                type="button"
                onClick={closeAssignTable}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--forest)]/8 text-[var(--forest)]"
                aria-label="Chiudi"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <ZoneTabsBar edgeToEdge={false} className="mb-0">
              {layout.zones.map((z) => {
                const active = z.name === (zone?.name ?? selectedZone);
                return (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => setSelectedZone(z.name)}
                    className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold ${
                      active
                        ? "bg-[var(--forest)] text-white"
                        : "bg-white text-[var(--forest-ink)]"
                    }`}
                  >
                    {z.name}
                  </button>
                );
              })}
            </ZoneTabsBar>
            <div className="flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {!zone || zone.tables.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-[var(--forest)]/20 bg-white/60 px-6 py-16 text-center text-sm text-[var(--forest-muted)]">
                  Nessun tavolo in questa zona. Configurali nel tab Zone.
                </div>
              ) : (
                <div className="relative mx-auto aspect-[4/5] w-full max-w-lg overflow-hidden rounded-3xl border border-[var(--forest)]/10 bg-[linear-gradient(rgba(45,90,39,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(45,90,39,0.05)_1px,transparent_1px)] bg-size-[24px_24px] bg-white">
                  <ZoneMarksLayer marks={marks} />
                  {zone.tables.map((table) => {
                    const occ = byTable.get(table.number);
                    const people = occ?.people ?? 0;
                    const soft = table.capacity + 2;
                    const wouldBe = people + assigning.total;
                    const tight = wouldBe > soft;

                    return (
                      <button
                        key={table.id}
                        type="button"
                        disabled={busy}
                        onClick={() => void assign(table.number, false)}
                        style={{ left: `${table.x}%`, top: `${table.y}%` }}
                        className={`absolute z-10 flex min-h-14 min-w-14 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-2xl border px-1.5 py-1 text-center shadow-md transition active:scale-95 disabled:opacity-60 ${
                          people > 0
                            ? tight
                              ? "border-amber-300 bg-amber-500 text-white"
                              : "border-red-200 bg-red-600 text-white"
                            : "border-[var(--forest)] bg-[var(--forest)] text-white"
                        }`}
                      >
                        <span className="text-[9px] font-bold uppercase opacity-90">
                          T{table.number}
                        </span>
                        <span className="text-[10px] font-semibold">
                          {people}/{table.capacity}
                        </span>
                        {occ?.names.length ? (
                          <span className="line-clamp-1 max-w-14 text-[9px] opacity-90">
                            {occ.names[0]}
                          </span>
                        ) : (
                          <span className="text-[9px] opacity-90">Libero</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="mx-auto mt-3 max-w-lg text-center text-xs text-[var(--forest-muted)]">
                Verde scuro = libero · Rosso = già occupato · Ambra = potrebbe
                superare capacità+2 (chiederà conferma)
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <CapacityOverrideDialog
        open={overrideOpen}
        check={pendingCheck}
        onCancel={() => {
          setOverrideOpen(false);
          setPendingCheck(null);
          setPendingTable(null);
        }}
        onConfirm={() => {
          if (pendingTable != null) void assign(pendingTable, true);
        }}
      />
    </>
  );
}
