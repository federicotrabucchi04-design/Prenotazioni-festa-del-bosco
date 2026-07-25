"use client";

import { useRef, useState } from "react";
import { Check, MapPinned, Pencil, Phone, Trash2, Users } from "lucide-react";
import type { Reservation } from "@/lib/types";
import { canEditReservations, useAuthStore } from "@/store/auth-store";
import { isTableAssigned, useUiStore } from "@/store/ui-store";
import { deleteReservation, setArrived } from "@/lib/reservations";
import { haptic } from "@/lib/haptic";
import toast from "react-hot-toast";
import { motion } from "framer-motion";

export function ReservationCard({ reservation }: { reservation: Reservation }) {
  const role = useAuthStore((s) => s.role);
  const isAdmin = canEditReservations(role);
  const openEditModal = useUiStore((s) => s.openEditModal);
  const openAssignTable = useUiStore((s) => s.openAssignTable);
  const markRecentlyArrived = useUiStore((s) => s.markRecentlyArrived);
  const assigned = isTableAssigned(reservation);
  const [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState(0);
  const dragging = useRef(false);

  async function toggleArrived() {
    if (busy) return;
    setBusy(true);
    try {
      const next = !reservation.arrived;
      await setArrived(reservation.id, next);
      if (next) {
        haptic(18);
        markRecentlyArrived(reservation.id);
        toast.success(`${reservation.name}: arrivato`);
      } else {
        toast.success(`${reservation.name}: non arrivato`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore aggiornamento");
    } finally {
      setBusy(false);
      setOffset(0);
    }
  }

  async function onDelete() {
    if (!isAdmin) return;
    const ok = window.confirm(`Eliminare la prenotazione di ${reservation.name}?`);
    if (!ok) return;
    try {
      await deleteReservation(reservation.id);
      toast.success("Prenotazione eliminata");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore eliminazione");
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div className="absolute inset-y-0 left-0 flex w-28 items-center justify-center bg-emerald-600 text-white">
        <div className="flex flex-col items-center gap-1 text-xs font-bold uppercase">
          <Check className="h-5 w-5" />
          Arrivato
        </div>
      </div>

      <motion.article
        style={{ x: offset }}
        drag="x"
        dragConstraints={{ left: 0, right: 110 }}
        dragElastic={0.08}
        onDragStart={() => {
          dragging.current = true;
        }}
        onDragEnd={(_, info) => {
          dragging.current = false;
          if (info.offset.x > 72) {
            void toggleArrived();
          } else {
            setOffset(0);
          }
        }}
        onDrag={(_, info) => {
          setOffset(Math.max(0, info.offset.x));
        }}
        className={`relative rounded-2xl border bg-white p-4 shadow-md shadow-[var(--forest)]/8 transition active:scale-[0.99] ${
          reservation.arrived
            ? "border-emerald-200/80 bg-emerald-50/60"
            : "border-white"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold text-[var(--forest-ink)]">
              {reservation.name}
            </h3>
            <p className="mt-0.5 text-sm text-[var(--forest-muted)]">
              {assigned
                ? `${reservation.zone} · Tavolo ${reservation.tableNumber}`
                : reservation.zone
                  ? `${reservation.zone} · Tavolo da assegnare`
                  : "Tavolo da assegnare"}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void toggleArrived()}
            className={`flex h-12 min-w-12 items-center justify-center rounded-xl px-3 text-xs font-bold uppercase tracking-wide transition active:scale-95 ${
              reservation.arrived
                ? "bg-emerald-600 text-white"
                : "bg-[var(--forest)]/10 text-[var(--forest)]"
            }`}
          >
            {reservation.arrived ? "Arrivato" : "Segna"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-sm text-[var(--forest-ink)]/85">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--forest-bg)] px-2.5 py-1">
            <Users className="h-3.5 w-3.5" />
            {reservation.adults} ad · {reservation.children} bam ·{" "}
            <strong>{reservation.total}</strong>
          </span>
          {reservation.phone ? (
            <a
              href={`tel:${reservation.phone}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--forest-bg)] px-2.5 py-1"
              onClick={(e) => {
                if (dragging.current) e.preventDefault();
              }}
            >
              <Phone className="h-3.5 w-3.5" />
              {reservation.phone}
            </a>
          ) : null}
        </div>

        {reservation.notes ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950/80">
            {reservation.notes}
          </p>
        ) : null}

        {!assigned ? (
          <button
            type="button"
            onClick={() => openAssignTable(reservation)}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--forest)] text-sm font-semibold text-white transition active:scale-[0.98]"
          >
            <MapPinned className="h-4 w-4" />
            Assegna tavolo
          </button>
        ) : null}

        {isAdmin ? (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => openEditModal(reservation)}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--forest)]/8 text-sm font-semibold text-[var(--forest)] transition active:scale-[0.98]"
            >
              <Pencil className="h-4 w-4" />
              Modifica
            </button>
            {assigned ? (
              <button
                type="button"
                onClick={() => openAssignTable(reservation)}
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--forest)]/8 px-3 text-sm font-semibold text-[var(--forest)] transition active:scale-[0.98]"
                title="Cambia tavolo"
              >
                <MapPinned className="h-4 w-4" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void onDelete()}
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-red-50 px-4 text-sm font-semibold text-red-700 transition active:scale-[0.98]"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </motion.article>
    </div>
  );
}
