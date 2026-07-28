"use client";

import { useState } from "react";
import { Delete, LogOut } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "@/store/auth-store";
import { useOrderBoard } from "@/hooks/use-order-board";
import { useAppSettings } from "@/hooks/use-app-settings";
import { clearOrderHighlight, setOrderHighlight } from "@/lib/order-board";

/** Terminale minimale: solo tastierino → evidenzia sulla cartina grande */
export function OrderKeypadScreen({ embedded = false }: { embedded?: boolean }) {
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
    <div
      className={`flex flex-col bg-[var(--forest-bg)] ${
        embedded ? "h-full overflow-hidden" : "min-h-dvh"
      }`}
    >
      {!embedded ? (
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
      ) : (
        <div className="shrink-0 px-2 pb-1 pt-6">
          <p className="text-[10px] font-semibold text-[var(--forest-muted)]">
            Digita e cerca
          </p>
        </div>
      )}

      <div
        className={`mx-auto flex w-full flex-1 flex-col justify-center ${
          embedded ? "max-w-none px-2 pb-2" : "max-w-md px-5 pb-10"
        }`}
      >
        <div
          className={`mb-3 border text-center ${
            embedded ? "rounded-2xl px-2 py-3" : "mb-6 rounded-3xl px-4 py-8"
          } ${
            lastResult === "ok"
              ? "border-amber-300 bg-amber-50"
              : lastResult === "missing"
                ? "border-red-200 bg-red-50"
                : "border-white/70 bg-white/90"
          }`}
        >
          <p className="text-sm text-[var(--forest-muted)]">Numero ordine</p>
          <p
            className={`mt-1 font-mono font-black tracking-widest text-[var(--forest-ink)] ${
              embedded ? "text-4xl" : "text-6xl"
            }`}
          >
            {digits || "····"}
          </p>
          {board.highlight ? (
            <p className="mt-2 text-xs font-semibold text-[var(--forest)]">
              Ultimo: {board.highlight.orderNumber}
              {board.highlight.found ? " · ok" : " · assente"}
            </p>
          ) : null}
        </div>

        <div className={`grid grid-cols-3 ${embedded ? "gap-1.5" : "gap-3"}`}>
          {keys.map((k) => (
            <button
              key={k}
              type="button"
              disabled={busy}
              onClick={() => press(k)}
              className={`flex items-center justify-center bg-white font-bold text-[var(--forest-ink)] shadow-sm active:scale-95 disabled:opacity-60 ${
                embedded
                  ? "h-11 rounded-xl text-xl"
                  : "h-[4.5rem] rounded-3xl text-3xl"
              }`}
            >
              {k === "⌫" ? (
                <Delete className={embedded ? "h-5 w-5" : "h-7 w-7"} />
              ) : (
                k
              )}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={busy || !digits}
          onClick={() => void submit()}
          className={`mt-3 bg-[var(--forest)] font-bold text-white shadow-md shadow-[var(--forest)]/25 active:scale-[0.99] disabled:opacity-50 ${
            embedded
              ? "h-11 rounded-xl text-sm"
              : "mt-4 h-16 rounded-3xl text-xl"
          }`}
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
          className={`mt-2 bg-white font-semibold text-[var(--forest-muted)] disabled:opacity-40 ${
            embedded ? "h-9 rounded-xl text-xs" : "mt-3 h-12 rounded-3xl text-sm"
          }`}
        >
          Togli cerchio
        </button>
      </div>
    </div>
  );
}
