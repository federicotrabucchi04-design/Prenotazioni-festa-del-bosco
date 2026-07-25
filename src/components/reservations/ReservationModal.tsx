"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { EVENT_DATE, calcTotal } from "@/lib/constants";
import type { CapacityCheck, ReservationInput, Zone } from "@/lib/types";
import {
  CapacityExceededError,
  upsertReservation,
} from "@/lib/reservations";
import { useUiStore } from "@/store/ui-store";
import { useVenueLayout } from "@/hooks/use-venue-layout";
import { useReservations } from "@/hooks/use-reservations";
import { checkTableCapacity, getZoneByName } from "@/lib/layout-utils";
import { CapacityOverrideDialog } from "@/components/CapacityOverrideDialog";
import toast from "react-hot-toast";

export function ReservationModal() {
  const open = useUiStore((s) => s.modalOpen);
  const editing = useUiStore((s) => s.editing);
  const closeModal = useUiStore((s) => s.closeModal);
  const { layout } = useVenueLayout();
  const { items } = useReservations();

  const firstZone = layout.zones[0]?.name ?? "Tenda 1";
  const firstTable = layout.zones[0]?.tables[0]?.number ?? 1;

  const [form, setForm] = useState({
    name: "",
    phone: "",
    adults: 2,
    children: 0,
    notes: "",
    zone: firstZone as Zone,
    tableNumber: firstTable,
    arrived: false,
    date: EVENT_DATE,
  });
  const [saving, setSaving] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [pendingCheck, setPendingCheck] = useState<CapacityCheck | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        name: editing.name,
        phone: editing.phone,
        adults: editing.adults,
        children: editing.children,
        notes: editing.notes,
        zone: editing.zone,
        tableNumber: editing.tableNumber,
        arrived: editing.arrived,
        date: editing.date || EVENT_DATE,
      });
    } else {
      const zone = layout.zones[0];
      setForm({
        name: "",
        phone: "",
        adults: 2,
        children: 0,
        notes: "",
        zone: zone?.name ?? firstZone,
        tableNumber: zone?.tables[0]?.number ?? 1,
        arrived: false,
        date: EVENT_DATE,
      });
    }
    setOverrideOpen(false);
    setPendingCheck(null);
  }, [open, editing, layout, firstZone]);

  const zoneTables = useMemo(() => {
    return getZoneByName(layout, form.zone)?.tables ?? [];
  }, [layout, form.zone]);

  const total = useMemo(
    () => calcTotal(form.adults, form.children),
    [form.adults, form.children],
  );

  const liveCheck = useMemo(
    () =>
      checkTableCapacity({
        layout,
        reservations: items,
        zone: form.zone,
        tableNumber: Number(form.tableNumber),
        incomingPeople: total,
        excludeReservationId: editing?.id || undefined,
      }),
    [layout, items, form.zone, form.tableNumber, total, editing?.id],
  );

  async function save(allowOverCapacity = false) {
    setSaving(true);
    try {
      const payload: ReservationInput = {
        id: editing?.id || undefined,
        ...form,
        adults: Number(form.adults),
        children: Number(form.children),
        tableNumber: Number(form.tableNumber),
        allowOverCapacity,
      };
      await upsertReservation(payload);
      toast.success(
        editing?.id ? "Prenotazione aggiornata" : "Prenotazione salvata",
      );
      setOverrideOpen(false);
      closeModal();
    } catch (err) {
      if (err instanceof CapacityExceededError) {
        setPendingCheck(err.check);
        setOverrideOpen(true);
      } else {
        toast.error(err instanceof Error ? err.message : "Errore salvataggio");
      }
    } finally {
      setSaving(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void save(false);
  }

  return (
    <>
      <AnimatePresence>
        {open ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
            <motion.button
              type="button"
              aria-label="Chiudi"
              className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              initial={{ y: "100%", opacity: 0.6 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="relative z-10 max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[var(--forest-ink)]">
                  {editing?.id ? "Modifica prenotazione" : "Nuova prenotazione"}
                </h2>
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--forest)]/8 text-[var(--forest)]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={onSubmit} className="space-y-3 pb-2">
                <Field label="Nome referente *">
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="field-input"
                    placeholder="Mario Rossi"
                  />
                </Field>

                <Field label="Telefono">
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="field-input"
                    inputMode="tel"
                    placeholder="3331234567"
                  />
                </Field>

                <div className="grid grid-cols-3 gap-3">
                  <Field label="Adulti">
                    <input
                      type="number"
                      min={0}
                      value={form.adults}
                      onChange={(e) =>
                        setForm({ ...form, adults: Number(e.target.value) })
                      }
                      className="field-input"
                    />
                  </Field>
                  <Field label="Bambini">
                    <input
                      type="number"
                      min={0}
                      value={form.children}
                      onChange={(e) =>
                        setForm({ ...form, children: Number(e.target.value) })
                      }
                      className="field-input"
                    />
                  </Field>
                  <Field label="Totale">
                    <input
                      value={total}
                      readOnly
                      className="field-input bg-[var(--forest-bg)]"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Zona *">
                    <select
                      value={form.zone}
                      onChange={(e) => {
                        const zone = e.target.value;
                        const tables = getZoneByName(layout, zone)?.tables ?? [];
                        setForm({
                          ...form,
                          zone,
                          tableNumber: tables[0]?.number ?? 1,
                        });
                      }}
                      className="field-input"
                    >
                      {layout.zones.map((z) => (
                        <option key={z.id} value={z.name}>
                          {z.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Tavolo *">
                    <select
                      value={form.tableNumber}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          tableNumber: Number(e.target.value),
                        })
                      }
                      className="field-input"
                      required
                    >
                      {zoneTables.length === 0 ? (
                        <option value="">Nessun tavolo in zona</option>
                      ) : (
                        zoneTables
                          .slice()
                          .sort((a, b) => a.number - b.number)
                          .map((t) => (
                            <option key={t.id} value={t.number}>
                              Tavolo {t.number} (max {t.capacity})
                            </option>
                          ))
                      )}
                    </select>
                  </Field>
                </div>

                <div
                  className={`rounded-2xl px-3 py-2 text-xs ${
                    liveCheck.ok
                      ? "bg-emerald-50 text-emerald-900"
                      : "bg-amber-50 text-amber-950"
                  }`}
                >
                  Occupazione tavolo: {liveCheck.proposedTotal}/
                  {liveCheck.softLimit} (capacità {liveCheck.capacity} + 2)
                  {liveCheck.guests.length
                    ? ` · già: ${liveCheck.guests.join(", ")}`
                    : ""}
                  {!liveCheck.ok
                    ? " · oltre il limite: chiederà conferma"
                    : ""}
                </div>

                <Field label="Note">
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="field-input min-h-24 resize-y"
                    placeholder="Allergie, richieste speciali…"
                  />
                </Field>

                <Field label="Data / sera">
                  <input
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="field-input"
                  />
                </Field>

                <label className="flex items-center gap-3 rounded-2xl bg-[var(--forest-bg)] px-3 py-3 text-sm font-medium text-[var(--forest-ink)]">
                  <input
                    type="checkbox"
                    checked={form.arrived}
                    onChange={(e) =>
                      setForm({ ...form, arrived: e.target.checked })
                    }
                    className="h-5 w-5 accent-[var(--forest)]"
                  />
                  Già arrivato
                </label>

                <button
                  type="submit"
                  disabled={saving || zoneTables.length === 0}
                  className="flex h-14 w-full items-center justify-center rounded-2xl bg-[var(--forest)] text-base font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
                >
                  {saving ? "Salvataggio…" : "Salva prenotazione"}
                </button>
              </form>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <CapacityOverrideDialog
        open={overrideOpen}
        check={pendingCheck}
        onCancel={() => {
          setOverrideOpen(false);
          setPendingCheck(null);
        }}
        onConfirm={() => void save(true)}
      />
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-[var(--forest-ink)]">
        {label}
      </span>
      {children}
    </label>
  );
}
