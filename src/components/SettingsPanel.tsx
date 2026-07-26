"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, RotateCcw, Settings2, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import toast from "react-hot-toast";
import { useAppSettings } from "@/hooks/use-app-settings";
import {
  type AppPins,
  type AppSettings,
  HIGHLIGHT_COLOR_PRESETS,
  resetAppSettings,
  saveAppSettings,
} from "@/lib/app-settings";

const PIN_FIELDS: { key: keyof AppPins; label: string; hint: string }[] = [
  { key: "staff", label: "Staff", hint: "Lista e mappa" },
  { key: "admin", label: "Admin", hint: "Controllo totale + impostazioni" },
  { key: "orderSetup", label: "Assegna ordini", hint: "Metti numeri sui tavoli" },
  { key: "orderDisplay", label: "Schermo cartina", hint: "TV / tablet grande" },
  { key: "orderKeypad", label: "Tastierino", hint: "Cerca ordine" },
];

export function SettingsPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { settings, loading } = useAppSettings();
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [showPins, setShowPins] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  async function save() {
    setSaving(true);
    try {
      await saveAppSettings(draft);
      toast.success("Impostazioni salvate");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (!window.confirm("Ripristinare tutte le impostazioni ai valori di fabbrica?")) {
      return;
    }
    setSaving(true);
    try {
      const next = await resetAppSettings();
      setDraft(next);
      toast.success("Impostazioni ripristinate");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col bg-[var(--forest-bg)]"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ type: "spring", stiffness: 280, damping: 28 }}
        >
          <header className="flex items-start justify-between gap-3 border-b border-white/50 bg-white/80 px-4 pb-3 pt-[max(0.85rem,env(safe-area-inset-top))] backdrop-blur-xl">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--forest)]">
                <Settings2 className="h-3.5 w-3.5" />
                Admin
              </p>
              <h2 className="text-lg font-semibold text-[var(--forest-ink)]">
                Impostazioni
              </h2>
              <p className="text-sm text-[var(--forest-muted)]">
                PIN, tempi, colori e regole comode
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--forest)]/8 text-[var(--forest)]"
              aria-label="Chiudi"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-28">
            {loading ? (
              <div className="h-24 animate-pulse rounded-3xl bg-white/70" />
            ) : (
              <div className="mx-auto max-w-lg space-y-4">
                <section className="rounded-3xl border border-white/70 bg-white/90 p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[var(--forest-ink)]">
                      Password (PIN)
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowPins((v) => !v)}
                      className="inline-flex items-center gap-1 rounded-xl bg-[var(--forest)]/8 px-2.5 py-1.5 text-xs font-semibold text-[var(--forest)]"
                    >
                      {showPins ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                      {showPins ? "Nascondi" : "Mostra"}
                    </button>
                  </div>
                  <div className="space-y-3">
                    {PIN_FIELDS.map(({ key, label, hint }) => (
                      <label key={key} className="block">
                        <span className="text-xs font-semibold text-[var(--forest-ink)]">
                          {label}
                        </span>
                        <span className="ml-2 text-[11px] text-[var(--forest-muted)]">
                          {hint}
                        </span>
                        <input
                          type={showPins ? "text" : "password"}
                          autoCapitalize="characters"
                          value={draft.pins[key]}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              pins: {
                                ...d.pins,
                                [key]: e.target.value.toUpperCase(),
                              },
                            }))
                          }
                          className="field-input mt-1 tracking-[0.12em]"
                        />
                      </label>
                    ))}
                  </div>
                </section>

                <section className="rounded-3xl border border-white/70 bg-white/90 p-4">
                  <p className="mb-3 text-sm font-semibold text-[var(--forest-ink)]">
                    Servizio ordini (schermo / tastierino)
                  </p>
                  <label className="block">
                    <span className="text-xs font-semibold text-[var(--forest-muted)]">
                      Durata cerchio sullo schermo (secondi)
                    </span>
                    <div className="mt-2 flex items-center gap-3">
                      <input
                        type="range"
                        min={3}
                        max={30}
                        value={draft.orderHighlightSeconds}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            orderHighlightSeconds: Number(e.target.value),
                          }))
                        }
                        className="w-full accent-[var(--forest)]"
                      />
                      <span className="w-10 text-center text-lg font-bold text-[var(--forest-ink)]">
                        {draft.orderHighlightSeconds}s
                      </span>
                    </div>
                  </label>

                  <p className="mb-2 mt-4 text-xs font-semibold text-[var(--forest-muted)]">
                    Colore cerchio
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {HIGHLIGHT_COLOR_PRESETS.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        title={c.label}
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            orderHighlightColor: c.hex,
                          }))
                        }
                        className={`h-10 w-10 rounded-full border-2 ${
                          draft.orderHighlightColor === c.hex
                            ? "border-[var(--forest-ink)] scale-110"
                            : "border-white"
                        }`}
                        style={{ backgroundColor: c.hex }}
                      />
                    ))}
                    <label className="flex h-10 items-center gap-2 rounded-full border border-[var(--forest)]/15 bg-[var(--forest)]/5 px-3 text-xs font-semibold text-[var(--forest)]">
                      Altro
                      <input
                        type="color"
                        value={draft.orderHighlightColor}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            orderHighlightColor: e.target.value,
                          }))
                        }
                        className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent"
                      />
                    </label>
                  </div>

                  <label className="mt-4 block">
                    <span className="text-xs font-semibold text-[var(--forest-muted)]">
                      Cifre massime numero ordine
                    </span>
                    <div className="mt-2 grid grid-cols-5 gap-2">
                      {[2, 3, 4, 5, 6].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() =>
                            setDraft((d) => ({ ...d, orderMaxDigits: n }))
                          }
                          className={`rounded-2xl py-2.5 text-sm font-bold ${
                            draft.orderMaxDigits === n
                              ? "bg-[var(--forest)] text-white"
                              : "bg-[var(--forest)]/8 text-[var(--forest)]"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </label>
                </section>

                <section className="rounded-3xl border border-white/70 bg-white/90 p-4">
                  <p className="mb-3 text-sm font-semibold text-[var(--forest-ink)]">
                    Capacità tavoli
                  </p>
                  <label className="block">
                    <span className="text-xs font-semibold text-[var(--forest-muted)]">
                      Extra posti senza chiedere conferma (capacità + N)
                    </span>
                    <div className="mt-2 flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={10}
                        value={draft.capacityOverflow}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            capacityOverflow: Number(e.target.value),
                          }))
                        }
                        className="w-full accent-[var(--forest)]"
                      />
                      <span className="w-10 text-center text-lg font-bold text-[var(--forest-ink)]">
                        +{draft.capacityOverflow}
                      </span>
                    </div>
                  </label>
                  <p className="mt-2 text-xs text-[var(--forest-muted)]">
                    Oltre questo limite l’app chiede conferma (override).
                  </p>
                </section>

                <button
                  type="button"
                  onClick={() => void reset()}
                  disabled={saving}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 py-3 text-sm font-semibold text-red-700"
                >
                  <RotateCcw className="h-4 w-4" />
                  Ripristina predefinite
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-white/50 bg-white/90 px-4 pb-[max(0.85rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
            <div className="mx-auto flex max-w-lg gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl bg-[var(--forest)]/10 px-4 py-3 text-sm font-semibold text-[var(--forest)]"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="flex-1 rounded-2xl bg-[var(--forest)] py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                Salva impostazioni
              </button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
