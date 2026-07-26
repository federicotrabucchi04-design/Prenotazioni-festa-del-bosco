"use client";

import { useState } from "react";
import { Delete, LogOut } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "@/store/auth-store";
import { useOrderBoard } from "@/hooks/use-order-board";
import { useAppSettings } from "@/hooks/use-app-settings";
import { clearOrderHighlight, setOrderHighlight } from "@/lib/order-board";

/** Terminale minimale: solo tastierino → evidenzia sulla cartina grande */
export function OrderKeypadScreen() {
  const logout = useAuthStore((s) => s.logout);
  const { board } = useOrderBoard();
  const { settings } = useAppSettings();
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<"ok" | "missing" | null>(null);
  const maxDigits = settings.orderMaxDigits;

  async function submit() {
    if (!digits) return;
    const n = Number(digits);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Numero non valido");
      return;
    }
    setBusy(true);
    try {
      const next = await setOrderHighlight(n);
      const found = next.highlight?.found ?? false;
      setLastResult(found ? "ok" : "missing");
      if (found) toast.success(`Ordine ${n} evidenziato`);
      else toast.error(`Ordine ${n} non assegnato a nessun tavolo`);
      setDigits("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  function press(key: string) {
    if (key === "C") {
      setDigits("");
      setLastResult(null);
      return;
    }
    if (key === "⌫") {
      setDigits((d) => d.slice(0, -1));
      return;
    }
    if (digits.length >= maxDigits) return;
    setDigits((d) => d + key);
    setLastResult(null);
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"] as const;

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--forest-bg)]">
      <header className="flex items-center justify-between px-4 pb-2 pt-[max(0.85rem,env(safe-area-inset-top))]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--forest)]">
            Tastierino
          </p>
          <h1 className="text-lg font-semibold text-[var(--forest-ink)]">
            Cerca ordine
          </h1>
        </div>
        <button
          type="button"
          onClick={() => {
            logout();
            toast.success("Disconnesso");
          }}
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[var(--forest)]"
          aria-label="Esci"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 pb-10">
        <div
          className={`mb-6 rounded-3xl border px-4 py-8 text-center ${
            lastResult === "ok"
              ? "border-amber-300 bg-amber-50"
              : lastResult === "missing"
                ? "border-red-200 bg-red-50"
                : "border-white/70 bg-white/90"
          }`}
        >
          <p className="text-sm text-[var(--forest-muted)]">Numero ordine</p>
          <p className="mt-2 font-mono text-6xl font-black tracking-widest text-[var(--forest-ink)]">
            {digits || "····"}
          </p>
          {board.highlight ? (
            <p className="mt-3 text-sm font-semibold text-[var(--forest)]">
              Ultimo inviato: {board.highlight.orderNumber}
              {board.highlight.found ? " · in cartina" : " · assente"}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {keys.map((k) => (
            <button
              key={k}
              type="button"
              disabled={busy}
              onClick={() => press(k)}
              className="flex h-[4.5rem] items-center justify-center rounded-3xl bg-white text-3xl font-bold text-[var(--forest-ink)] shadow-sm active:scale-95 disabled:opacity-60"
            >
              {k === "⌫" ? <Delete className="h-7 w-7" /> : k}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={busy || !digits}
          onClick={() => void submit()}
          className="mt-4 h-16 rounded-3xl bg-[var(--forest)] text-xl font-bold text-white shadow-md shadow-[var(--forest)]/25 active:scale-[0.99] disabled:opacity-50"
        >
          Cerca sulla cartina
        </button>

        <button
          type="button"
          disabled={busy || !board.highlight}
          onClick={() => {
            void clearOrderHighlight();
            setLastResult(null);
          }}
          className="mt-3 h-12 rounded-3xl bg-white text-sm font-semibold text-[var(--forest-muted)] disabled:opacity-40"
        >
          Togli cerchio
        </button>
      </div>
    </div>
  );
}
