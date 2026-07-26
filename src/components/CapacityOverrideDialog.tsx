"use client";

import type { CapacityCheck } from "@/lib/types";
import { AnimatePresence, motion } from "framer-motion";

export function CapacityOverrideDialog({
  open,
  check,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  check: CapacityCheck | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!check) return null;

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.button
            type="button"
            aria-label="Chiudi"
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
          />
          <motion.div
            role="alertdialog"
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            className="relative z-10 w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl"
          >
            <h3 className="text-lg font-semibold text-[var(--forest-ink)]">
              Tavolo oltre il limite
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--forest-muted)]">
              Capacità tavolo: <strong>{check.capacity}</strong> posti.
              <br />
              Limite soft consentito: <strong>{check.softLimit}</strong> (capacità + extra
              impostazioni).
              <br />
              Persone previste: <strong>{check.proposedTotal}</strong> (
              {check.currentOthers} già assegnate + {check.incoming} nuove).
            </p>
            {check.guests.length > 0 ? (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-950">
                Già al tavolo: {check.guests.join(", ")}
              </p>
            ) : null}
            <p className="mt-3 text-sm text-[var(--forest-ink)]">
              Vuoi assegnare comunque questo tavolo?
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="h-12 rounded-2xl bg-[var(--forest)]/8 text-sm font-semibold text-[var(--forest)]"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="h-12 rounded-2xl bg-amber-600 text-sm font-semibold text-white"
              >
                Assegna comunque
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
