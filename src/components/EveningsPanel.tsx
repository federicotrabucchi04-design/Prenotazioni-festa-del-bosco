"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Archive, CalendarDays, X } from "lucide-react";
import toast from "react-hot-toast";
import { archiveAndCreateEvening } from "@/lib/evenings";
import { refreshReservationListeners } from "@/lib/reservations";
import { useEvenings } from "@/hooks/use-evenings";
import { EVENT_DATE } from "@/lib/constants";

function formatArchivedAt(ts: number) {
  try {
    return new Date(ts).toLocaleString("it-IT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function EveningsPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { active, archives, loading } = useEvenings();
  const [label, setLabel] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleArchiveAndCreate() {
    const nextLabel = label.trim();
    if (!nextLabel) {
      toast.error("Inserisci il nome della nuova serata");
      return;
    }
    if (!confirming) {
      setConfirming(true);
      return;
    }

    setBusy(true);
    try {
      const { archive, evening } = await archiveAndCreateEvening(nextLabel);
      refreshReservationListeners();
      toast.success(
        `Serata «${archive.eveningLabel}» archiviata (${archive.totalPeopleBooked} persone). Attiva: «${evening.label}».`,
      );
      setLabel("");
      setConfirming(false);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Operazione non riuscita");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Chiudi"
            onClick={() => {
              if (busy) return;
              setConfirming(false);
              onClose();
            }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="evenings-title"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="relative z-10 max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--forest-muted)]">
                  Gestione serate
                </p>
                <h2
                  id="evenings-title"
                  className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--forest)]"
                >
                  Serate
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (busy) return;
                  setConfirming(false);
                  onClose();
                }}
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--forest)]/8 text-[var(--forest)]"
                aria-label="Chiudi"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <section className="mb-5 rounded-2xl bg-[var(--forest)]/6 p-4">
              <div className="mb-1 flex items-center gap-2 text-[var(--forest)]">
                <CalendarDays className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-wide">
                  Serata attiva
                </span>
              </div>
              {loading ? (
                <p className="text-sm text-[var(--forest-muted)]">Caricamento…</p>
              ) : (
                <p className="text-lg font-semibold text-[var(--forest-ink)]">
                  {active?.label ?? EVENT_DATE}
                </p>
              )}
            </section>

            <section className="mb-6">
              <h3 className="mb-2 text-sm font-semibold text-[var(--forest-ink)]">
                Archivia e crea nuova
              </h3>
              <p className="mb-3 text-sm text-[var(--forest-muted)]">
                Le prenotazioni della serata attuale vengono eliminate. Resta solo
                il numero di persone che avevano prenotato (e un riepilogo
                minimale).
              </p>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--forest-muted)]">
                Nome nuova serata
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => {
                  setLabel(e.target.value);
                  setConfirming(false);
                }}
                placeholder="es. 9 Agosto"
                className="mb-3 w-full rounded-2xl border border-[var(--forest)]/15 bg-white px-4 py-3 text-[var(--forest-ink)] outline-none ring-[var(--forest)]/30 focus:ring-2"
                disabled={busy}
              />

              {confirming ? (
                <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  Confermi? Archivi «{active?.label ?? "serata attuale"}» e
                  crei «{label.trim()}». I dettagli delle prenotazioni non
                  verranno conservati.
                </div>
              ) : null}

              <button
                type="button"
                disabled={busy || !label.trim()}
                onClick={() => void handleArchiveAndCreate()}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--forest)] px-4 py-3.5 text-sm font-semibold text-white transition enabled:active:scale-[0.98] disabled:opacity-50"
              >
                <Archive className="h-4 w-4" />
                {busy
                  ? "Operazione in corso…"
                  : confirming
                    ? "Conferma archivio"
                    : "Archivia e crea nuova"}
              </button>
              {confirming ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                  className="mt-2 w-full rounded-2xl px-4 py-2.5 text-sm font-medium text-[var(--forest-muted)]"
                >
                  Annulla conferma
                </button>
              ) : null}
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold text-[var(--forest-ink)]">
                Storico archivi
              </h3>
              {archives.length === 0 ? (
                <p className="text-sm text-[var(--forest-muted)]">
                  Nessuna serata archiviata ancora.
                </p>
              ) : (
                <ul className="space-y-2">
                  {archives.map((a) => (
                    <li
                      key={a.eveningId}
                      className="rounded-2xl border border-[var(--forest)]/10 bg-[var(--forest-bg)] px-4 py-3"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="font-semibold text-[var(--forest-ink)]">
                          {a.eveningLabel}
                        </p>
                        <p className="text-sm font-bold text-[var(--forest)]">
                          {a.totalPeopleBooked} pers.
                        </p>
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--forest-muted)]">
                        {a.reservationCount} prenotazioni
                        {a.arrivedPeopleCount > 0
                          ? ` · ${a.arrivedPeopleCount} arrivate`
                          : ""}
                        {" · "}
                        {formatArchivedAt(a.archivedAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
