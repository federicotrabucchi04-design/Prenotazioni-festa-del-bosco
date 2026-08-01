"use client";

import { useState } from "react";
import { Delete, LogOut } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "@/store/auth-store";
import { useOrderBoard } from "@/hooks/use-order-board";
import { useAppSettings } from "@/hooks/use-app-settings";
import { clearOrderHighlight, setOrderHighlight } from "@/lib/order-board";
import { OnlineStatusBadge } from "@/components/OnlineStatusBadge";

/**
 * Tastierino — ottimizzato per telefono (tasti grandi, safe-area).
 * Resta sempre usabile; solo il cerchio sulla TV segue i secondi.
 */
export function OrderKeypadScreen({ embedded = false }: { embedded?: boolean }) {
  const logout = useAuthStore((s) => s.logout);
  const { board } = useOrderBoard();
  const { settings } = useAppSettings();
  const [digits, setDigits] = useState("");
  const [lastResult, setLastResult] = useState<"ok" | "missing" | null>(null);
  const maxDigits = settings.orderMaxDigits;

  function submit() {
    if (!digits) return;
    const n = Number(digits);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Numero non valido");
      return;
    }

    const sent = n;
    setDigits("");
    setLastResult(null);

    void setOrderHighlight(sent)
      .then((next) => {
        const found = next.highlight?.found ?? false;
        setLastResult(found ? "ok" : "missing");
        if (found) toast.success(`Ordine ${sent} evidenziato`);
        else toast.error(`Ordine ${sent} non assegnato a nessun tavolo`);
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Errore");
      });
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
        embedded
          ? "h-full overflow-hidden"
          : "h-dvh max-h-dvh overflow-hidden"
      }`}
    >
      {!embedded ? (
        <header className="flex shrink-0 items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div>
            <div className="mb-0.5 flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--forest)]">
                Tastierino · telefono
              </p>
              <OnlineStatusBadge />
            </div>
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
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[var(--forest)] touch-manipulation"
            aria-label="Esci"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </header>
      ) : (
        <div className="shrink-0 px-2 pb-1 pt-6">
          <p className="text-[10px] font-semibold text-[var(--forest-muted)]">
            Digita e cerca · sempre attivo
          </p>
        </div>
      )}

      <div
        className={`mx-auto flex min-h-0 w-full flex-1 flex-col ${
          embedded
            ? "max-w-none justify-center px-2 pb-2"
            : "max-w-lg justify-end px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:justify-center"
        }`}
      >
        <div
          className={`shrink-0 border text-center ${
            embedded
              ? "mb-2 rounded-2xl px-2 py-2"
              : "mb-3 rounded-3xl px-4 py-4 sm:mb-5 sm:py-7"
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
            className={`mt-1 font-mono font-black tracking-widest text-[var(--forest-ink)] tabular-nums ${
              embedded
                ? "text-3xl"
                : "text-[clamp(2.5rem,14vw,4.5rem)]"
            }`}
          >
            {digits || "····"}
          </p>
          {board.highlight ? (
            <p className="mt-1.5 text-xs font-semibold text-[var(--forest)]">
              Ultimo: {board.highlight.orderNumber}
              {board.highlight.found ? " · ok" : " · assente"}
            </p>
          ) : null}
        </div>

        <div
          className={`grid min-h-0 flex-1 grid-cols-3 content-stretch ${
            embedded ? "max-h-[55%] gap-1.5" : "gap-2 sm:gap-3 sm:flex-none"
          }`}
          style={
            embedded
              ? undefined
              : { gridTemplateRows: "repeat(4, minmax(3.25rem, 1fr))" }
          }
        >
          {keys.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => press(k)}
              className={`flex min-h-[3.25rem] items-center justify-center bg-white font-bold text-[var(--forest-ink)] shadow-sm touch-manipulation active:scale-[0.97] ${
                embedded
                  ? "h-11 rounded-xl text-xl"
                  : "rounded-2xl text-[clamp(1.5rem,6vw,2.25rem)] sm:min-h-[4.5rem] sm:rounded-3xl"
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
          disabled={!digits}
          onClick={() => submit()}
          className={`mt-2 shrink-0 bg-[var(--forest)] font-bold text-white shadow-md shadow-[var(--forest)]/25 touch-manipulation active:scale-[0.99] disabled:opacity-50 ${
            embedded
              ? "h-11 rounded-xl text-sm"
              : "mt-3 h-14 rounded-2xl text-lg sm:h-16 sm:rounded-3xl sm:text-xl"
          }`}
        >
          Cerca sulla cartina
        </button>

        <button
          type="button"
          disabled={!board.highlight}
          onClick={() => {
            void clearOrderHighlight();
            setLastResult(null);
          }}
          className={`mt-2 shrink-0 bg-white font-semibold text-[var(--forest-muted)] touch-manipulation disabled:opacity-40 ${
            embedded ? "h-9 rounded-xl text-xs" : "h-11 rounded-2xl text-sm"
          }`}
        >
          Togli cerchio
        </button>
      </div>
    </div>
  );
}
