"use client";

import { useMemo } from "react";
import { Plus, Search, Trees } from "lucide-react";
import { useReservations } from "@/hooks/use-reservations";
import { ReservationCard } from "@/components/reservations/ReservationCard";
import { ReservationSkeleton } from "@/components/reservations/ReservationSkeleton";
import { canEditReservations, useAuthStore } from "@/store/auth-store";
import { useUiStore } from "@/store/ui-store";
import { AnimatePresence, motion } from "framer-motion";

export function ReservationList({ compact = false }: { compact?: boolean }) {
  const { items, loading } = useReservations();
  const search = useUiStore((s) => s.search);
  const setSearch = useUiStore((s) => s.setSearch);
  const openCreateModal = useUiStore((s) => s.openCreateModal);
  const role = useAuthStore((s) => s.role);
  const isAdmin = canEditReservations(role);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((r) => {
      const hay = `${r.name} ${r.phone} ${r.zone} ${r.tableNumber} ${r.notes}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, search]);

  const arrivedCount = items.filter((r) => r.arrived).length;
  const peopleCount = items.reduce((sum, r) => sum + r.total, 0);

  return (
    <div
      className={`relative mx-auto px-4 pt-4 ${
        compact
          ? "max-w-none pb-4 pt-7"
          : "max-w-lg pb-28 sm:max-w-xl md:max-w-2xl"
      }`}
    >
      <div className={`mb-4 grid grid-cols-3 gap-2 text-center ${compact ? "mb-2" : ""}`}>
        <Stat label="Prenotazioni" value={String(items.length)} compact={compact} />
        <Stat label="Arrivati" value={`${arrivedCount}`} compact={compact} />
        <Stat label="Persone" value={String(peopleCount)} compact={compact} />
      </div>

      <div className={`relative ${compact ? "mb-2" : "mb-4"}`}>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--forest-muted)]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca nome, telefono, tavolo…"
          className={`w-full rounded-2xl border border-white bg-white/80 pl-11 pr-4 text-sm text-[var(--forest-ink)] outline-none ring-[var(--forest)]/25 placeholder:text-[var(--forest-muted)] focus:ring-2 ${
            compact ? "h-10" : "h-12"
          }`}
        />
      </div>

      {loading ? (
        <ReservationSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState hasSearch={Boolean(search.trim())} />
      ) : (
        <ul className={`space-y-3 ${compact ? "space-y-2" : ""}`}>
          <AnimatePresence initial={false}>
            {filtered.map((reservation) => (
              <motion.li
                key={reservation.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
              >
                <ReservationCard reservation={reservation} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {isAdmin && !compact ? (
        <button
          type="button"
          onClick={openCreateModal}
          className="fixed bottom-24 right-5 z-40 flex h-14 items-center gap-2 rounded-full bg-[var(--forest)] px-5 text-sm font-semibold text-white shadow-lg shadow-[var(--forest)]/30 transition active:scale-95"
        >
          <Plus className="h-5 w-5" />
          Nuova
        </button>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  compact,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/70 bg-white/70 shadow-sm backdrop-blur ${
        compact ? "px-1.5 py-2" : "px-2 py-3"
      }`}
    >
      <p
        className={`font-bold text-[var(--forest-ink)] ${
          compact ? "text-base" : "text-lg"
        }`}
      >
        {value}
      </p>
      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--forest-muted)]">
        {label}
      </p>
    </div>
  );
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-[var(--forest)]/20 bg-white/50 px-6 py-16 text-center">
      <Trees className="mb-3 h-10 w-10 text-[var(--forest)]/50" />
      <p className="font-semibold text-[var(--forest-ink)]">
        {hasSearch ? "Nessun risultato" : "Nessuna prenotazione"}
      </p>
      <p className="mt-1 max-w-xs text-sm text-[var(--forest-muted)]">
        {hasSearch
          ? "Prova un altro nome o numero di tavolo."
          : "Quando arriveranno le prenotazioni, le vedrai qui."}
      </p>
    </div>
  );
}
