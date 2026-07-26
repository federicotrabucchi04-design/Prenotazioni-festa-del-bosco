"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Archive, CalendarDays, Check, Plus, X } from "lucide-react";
import toast from "react-hot-toast";
import {
  archiveEvening,
  createEvening,
  setActiveEvening,
} from "@/lib/evenings";
import { refreshReservationListeners } from "@/lib/reservations";
import { useEvenings } from "@/hooks/use-evenings";
import { canEditReservations, useAuthStore } from "@/store/auth-store";
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
  const { active, evenings, archives, loading } = useEvenings();
  const role = useAuthStore((s) => s.role);
  const isAdmin = canEditReservations(role);
  const openEvenings = evenings.filter((e) => e.status === "active");

  const [newLabel, setNewLabel] = useState("");
  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    const nextLabel = newLabel.trim();
    if (!nextLabel) {
      toast.error("Inserisci il nome della nuova serata");
      return;
    }
    setBusy(true);
    try {
      const evening = await createEvening(nextLabel, { switchTo: true });
      refreshReservationListeners();
      toast.success(`Serata «${evening.label}» creata e selezionata`);
      setNewLabel("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Creazione non riuscita");
    } finally {
      setBusy(false);
    }
  }

  async function handleSelect(id: string) {
    if (id === active?.id) return;
    setBusy(true);
    try {
      await setActiveEvening(id);
      refreshReservationListeners();
      toast.success("Serata selezionata");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Selezione non riuscita");
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive(id: string) {
    if (archiveConfirmId !== id) {
      setArchiveConfirmId(id);
      return;
    }
    setBusy(true);
    try {
      const archive = await archiveEvening(id);
      refreshReservationListeners();
      toast.success(
        `«${archive.eveningLabel}» archiviata · ${archive.totalPeopleBooked} persone`,
      );
      setArchiveConfirmId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Archivio non riuscito");
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
              setArchiveConfirmId(null);
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
                  setArchiveConfirmId(null);
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
                  Stai gestendo
                </span>
              </div>
              {loading ? (
                <p className="text-sm text-[var(--forest-muted)]">Caricamento…</p>
              ) : (
                <p className="text-lg font-semibold text-[var(--forest-ink)]">
                  {active?.label ?? EVENT_DATE}
                </p>
              )}
              <p className="mt-1 text-xs text-[var(--forest-muted)]">
                Puoi avere più serate aperte insieme e passare da una all’altra.
              </p>
            </section>

            <section className="mb-6">
              <h3 className="mb-2 text-sm font-semibold text-[var(--forest-ink)]">
                Serate aperte
              </h3>
              {openEvenings.length === 0 ? (
                <p className="mb-3 text-sm text-[var(--forest-muted)]">
                  Nessuna serata aperta.
                </p>
              ) : (
                <ul className="mb-3 space-y-2">
                  {openEvenings.map((e) => {
                    const selected = e.id === active?.id;
                    return (
                      <li
                        key={e.id}
                        className={`rounded-2xl border px-3 py-3 ${
                          selected
                            ? "border-[var(--forest)] bg-[var(--forest)]/8"
                            : "border-[var(--forest)]/10 bg-[var(--forest-bg)]"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleSelect(e.id)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <p className="font-semibold text-[var(--forest-ink)]">
                              {e.label}
                            </p>
                            <p className="text-xs text-[var(--forest-muted)]">
                              {selected ? "Selezionata ora" : "Tocca per selezionare"}
                            </p>
                          </button>
                          {selected ? (
                            <Check className="h-5 w-5 shrink-0 text-[var(--forest)]" />
                          ) : null}
                          {isAdmin ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleArchive(e.id)}
                              className="flex h-10 items-center gap-1 rounded-xl bg-amber-50 px-2.5 text-xs font-semibold text-amber-900"
                              title="Archivia"
                            >
                              <Archive className="h-3.5 w-3.5" />
                              Archivia
                            </button>
                          ) : null}
                        </div>
                        {archiveConfirmId === e.id ? (
                          <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-950">
                            Confermi archivio di «{e.label}»? Restano solo i
                            totali persone; le prenotazioni dettagliate vengono
                            eliminate. Tocca di nuovo Archivia per confermare.
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {isAdmin ? (
              <section className="mb-6">
                <h3 className="mb-2 text-sm font-semibold text-[var(--forest-ink)]">
                  Crea nuova serata
                </h3>
                <p className="mb-3 text-sm text-[var(--forest-muted)]">
                  Non archivia le altre: restano tutte gestibili in parallelo.
                </p>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--forest-muted)]">
                  Nome serata
                </label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="es. 9 Agosto"
                  className="mb-3 w-full rounded-2xl border border-[var(--forest)]/15 bg-white px-4 py-3 text-[var(--forest-ink)] outline-none ring-[var(--forest)]/30 focus:ring-2"
                  disabled={busy}
                />
                <button
                  type="button"
                  disabled={busy || !newLabel.trim()}
                  onClick={() => void handleCreate()}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--forest)] px-4 py-3.5 text-sm font-semibold text-white transition enabled:active:scale-[0.98] disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  {busy ? "Creazione…" : "Crea serata"}
                </button>
              </section>
            ) : null}

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
