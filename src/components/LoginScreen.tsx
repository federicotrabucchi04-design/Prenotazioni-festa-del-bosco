"use client";

import { useState } from "react";
import { Trees, LockKeyhole, ShieldCheck, Users } from "lucide-react";
import { useAuthStore } from "@/store/auth-store";
import { motion } from "framer-motion";
import toast from "react-hot-toast";

export function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    const result = login(pin);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      setPin("");
      return;
    }
    toast.success(
      result.role === "admin" ? "Accesso Admin" : "Accesso Staff",
    );
  }

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-[var(--forest-bg)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(45,90,39,0.18),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(30,61,26,0.12),_transparent_45%)]" />
      <div className="pointer-events-none absolute -left-16 top-24 h-56 w-56 rounded-full bg-[var(--forest)]/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-10 bottom-28 h-48 w-48 rounded-full bg-emerald-700/10 blur-3xl" />

      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          className="text-center"
        >
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--forest)] text-white shadow-lg shadow-[var(--forest)]/25">
            <Trees className="h-8 w-8" strokeWidth={1.75} />
          </div>
          <p className="font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight text-[var(--forest-ink)]">
            Feste del Bosco
          </p>
          <p className="mt-2 text-[15px] text-[var(--forest-muted)]">
            Gestione prenotazioni e tavoli per lo staff
          </p>
        </motion.div>

        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, type: "spring", stiffness: 260, damping: 24 }}
          onSubmit={submit}
          className="mt-10 rounded-3xl border border-white/60 bg-white/75 p-6 shadow-xl shadow-[var(--forest)]/10 backdrop-blur-xl"
        >
          <label className="mb-2 block text-sm font-medium text-[var(--forest-ink)]">
            Inserisci PIN
          </label>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--forest)]/55" />
            <input
              type="password"
              inputMode="text"
              autoComplete="current-password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN di accesso"
              className="h-14 w-full rounded-2xl border border-[var(--forest)]/15 bg-white pl-12 pr-4 text-lg tracking-[0.2em] text-[var(--forest-ink)] outline-none ring-[var(--forest)]/30 placeholder:tracking-normal placeholder:text-[var(--forest-muted)] focus:ring-2"
            />
          </div>

          <button
            type="submit"
            disabled={busy || !pin.trim()}
            className="mt-4 flex h-14 w-full items-center justify-center rounded-2xl bg-[var(--forest)] text-base font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Entra
          </button>

          <div className="mt-6 grid grid-cols-2 gap-3 text-left text-xs text-[var(--forest-muted)]">
            <div className="rounded-2xl bg-[var(--forest)]/5 p-3">
              <Users className="mb-1.5 h-4 w-4 text-[var(--forest)]" />
              <p className="font-semibold text-[var(--forest-ink)]">Staff</p>
              <p>Lista, mappa, segno Arrivato</p>
            </div>
            <div className="rounded-2xl bg-[var(--forest)]/5 p-3">
              <ShieldCheck className="mb-1.5 h-4 w-4 text-[var(--forest)]" />
              <p className="font-semibold text-[var(--forest-ink)]">Admin</p>
              <p>Aggiungi, modifica, elimina</p>
            </div>
          </div>
        </motion.form>
      </main>
    </div>
  );
}
