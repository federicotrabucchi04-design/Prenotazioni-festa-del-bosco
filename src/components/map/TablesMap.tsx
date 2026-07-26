"use client";

import { useMemo } from "react";
import { Map as MapIcon, Trees } from "lucide-react";
import { EVENT_DATE } from "@/lib/constants";
import { useReservations } from "@/hooks/use-reservations";
import { useVenueLayout } from "@/hooks/use-venue-layout";
import { canEditReservations, useAuthStore } from "@/store/auth-store";
import { useUiStore } from "@/store/ui-store";
import type { Reservation } from "@/lib/types";
import { getZoneByName } from "@/lib/layout-utils";
import { ZoneMarksLayer } from "@/components/map/ZoneMarksLayer";
import { ZoneTabsBar } from "@/components/ZoneTabsBar";
import toast from "react-hot-toast";

export function TablesMap() {
  const { items, loading: loadingReservations } = useReservations();
  const { layout, loading: loadingLayout } = useVenueLayout();
  const selectedZone = useUiStore((s) => s.selectedZone);
  const setSelectedZone = useUiStore((s) => s.setSelectedZone);
  const recentlyArrivedIds = useUiStore((s) => s.recentlyArrivedIds);
  const openEditModal = useUiStore((s) => s.openEditModal);
  const openPrintMap = useUiStore((s) => s.openPrintMap);
  const role = useAuthStore((s) => s.role);
  const isAdmin = canEditReservations(role);

  const zone = getZoneByName(layout, selectedZone) ?? layout.zones[0] ?? null;
  const marks = zone?.marks ?? [];

  const byTable = useMemo(() => {
    const map = new Map<number, Reservation[]>();
    if (!zone) return map;
    for (const r of items) {
      if (r.zone !== zone.name) continue;
      const list = map.get(r.tableNumber) ?? [];
      list.push(r);
      map.set(r.tableNumber, list);
    }
    return map;
  }, [items, zone]);

  const occupiedTables = byTable.size;
  const loading = loadingReservations || loadingLayout;
  const hasContent = Boolean(zone && (zone.tables.length > 0 || marks.length > 0));

  return (
    <div className="mx-auto max-w-lg min-w-0 px-4 pb-28 pt-4">
      <ZoneTabsBar>
        {layout.zones.map((z) => {
          const active = z.name === (zone?.name ?? selectedZone);
          const count = items.filter((r) => r.zone === z.name).length;
          return (
            <button
              key={z.id}
              type="button"
              onClick={() => setSelectedZone(z.name)}
              className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold transition active:scale-95 ${
                active
                  ? "bg-[var(--forest)] text-white shadow-md shadow-[var(--forest)]/25"
                  : "bg-white/80 text-[var(--forest-ink)]"
              }`}
            >
              {z.name}
              <span
                className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${
                  active ? "bg-white/20" : "bg-[var(--forest)]/10"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </ZoneTabsBar>
      <div className="mb-3 flex items-center justify-between rounded-2xl border border-white/70 bg-white/70 px-4 py-3 text-sm backdrop-blur">
        <p className="font-medium text-[var(--forest-ink)]">
          {zone?.name ?? "Nessuna zona"}
        </p>
        <p className="text-[var(--forest-muted)]">
          {occupiedTables}/{zone?.tables.length ?? 0} tavoli usati
        </p>
      </div>

      <button
        type="button"
        onClick={openPrintMap}
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--forest)]/15 bg-white/90 px-4 py-3 text-sm font-semibold text-[var(--forest)] shadow-sm transition active:scale-[0.99]"
      >
        <MapIcon className="h-4 w-4" />
        Cartina globale (stampa / scarica)
      </button>

      {loading || !zone ? (
        <div className="aspect-[4/5] animate-pulse rounded-3xl bg-white/70" />
      ) : !hasContent ? (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-[var(--forest)]/20 bg-white/50 px-6 py-16 text-center">
          <Trees className="mb-3 h-10 w-10 text-[var(--forest)]/50" />
          <p className="font-semibold text-[var(--forest-ink)]">
            Nessun tavolo in questa zona
          </p>
          <p className="mt-1 text-sm text-[var(--forest-muted)]">
            {isAdmin
              ? "Apri il tab Zone: aggiungi tavoli e riferimenti (linee, rettangoli, scritte)."
              : "Chiedi all’admin di configurare i tavoli."}
          </p>
        </div>
      ) : (
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl border border-[var(--forest)]/10 bg-[linear-gradient(rgba(45,90,39,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(45,90,39,0.05)_1px,transparent_1px)] bg-size-[24px_24px] bg-white">
          <ZoneMarksLayer marks={marks} />

          {zone.tables.map((table) => {
            const guests = byTable.get(table.number) ?? [];
            const people = guests.reduce((s, r) => s + r.total, 0);
            const arrivedAny = guests.some((r) => r.arrived);
            const occupiedTable = guests.length > 0;
            const pulse = guests.some((r) => recentlyArrivedIds.has(r.id));
            const overSoft = people > table.capacity + 2;

            return (
              <button
                key={table.id}
                type="button"
                onClick={() => {
                  if (guests.length === 1) {
                    if (isAdmin) openEditModal(guests[0]!);
                    else
                      toast(
                        `${guests[0]!.name} · ${guests[0]!.total} pers.${guests[0]!.arrived ? " · Arrivato" : ""}`,
                      );
                    return;
                  }
                  if (guests.length > 1) {
                    const summary = guests
                      .map((g) => `${g.name} (${g.total})`)
                      .join(", ");
                    if (isAdmin) {
                      openEditModal(guests[0]!);
                      toast(`Più prenotazioni: ${summary}`, { duration: 3500 });
                    } else {
                      toast(summary, { duration: 3500 });
                    }
                    return;
                  }
                  if (isAdmin) {
                    useUiStore.setState({
                      modalOpen: true,
                      editing: {
                        id: "",
                        name: "",
                        phone: "",
                        adults: 2,
                        children: 0,
                        total: 2,
                        notes: "",
                        zone: zone.name,
                        tableNumber: table.number,
                        arrived: false,
                        date: EVENT_DATE,
                      },
                    });
                  }
                }}
                style={{ left: `${table.x}%`, top: `${table.y}%` }}
                className={`absolute z-10 flex min-h-14 min-w-14 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-2xl border px-1.5 py-1 text-center shadow-sm transition active:scale-95 ${
                  occupiedTable
                    ? arrivedAny
                      ? "border-emerald-300 bg-emerald-600 text-white"
                      : overSoft
                        ? "border-amber-300 bg-amber-600 text-white"
                        : "border-red-200 bg-red-600 text-white"
                    : "border-emerald-200/70 bg-emerald-50 text-[var(--forest)]"
                } ${pulse ? "animate-pulse-soft" : ""}`}
              >
                <span className="text-[9px] font-bold uppercase tracking-wide opacity-80">
                  T{table.number}
                </span>
                {occupiedTable ? (
                  <>
                    <span className="line-clamp-2 max-w-16 text-[10px] font-semibold leading-tight">
                      {guests.length === 1
                        ? guests[0]!.name
                        : `${guests.length} gruppi`}
                    </span>
                    <span className="text-[10px] opacity-90">
                      {people}/{table.capacity}
                    </span>
                  </>
                ) : (
                  <span className="text-[10px] font-medium opacity-70">
                    max {table.capacity}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3 text-xs text-[var(--forest-muted)]">
        <Legend swatch="bg-emerald-50 border border-emerald-200" label="Libero" />
        <Legend swatch="bg-red-600" label="Occupato" />
        <Legend swatch="bg-emerald-600" label="Arrivato" />
        <Legend swatch="bg-amber-600" label="Oltre limite soft" />
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-4 border-t-2 border-dashed border-[var(--forest)]" />
          Riferimenti
        </span>
      </div>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-3.5 w-3.5 rounded ${swatch}`} />
      {label}
    </span>
  );
}
