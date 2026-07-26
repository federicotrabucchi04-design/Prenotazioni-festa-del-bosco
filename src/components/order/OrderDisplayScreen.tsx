"use client";

import { useEffect, useMemo, useState } from "react";
import { LogOut } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "@/store/auth-store";
import { useVenueLayout } from "@/hooks/use-venue-layout";
import { useOrderBoard } from "@/hooks/use-order-board";
import {
  OrderCartinaView,
  resolveOrderCartina,
} from "@/components/order/OrderCartinaView";
import { loadCartinaPrefs } from "@/lib/cartina";
import { clearOrderHighlight } from "@/lib/order-board";

/** Schermo a tutto schermo: cartina + cerchio sul numero cercato dal tastierino */
export function OrderDisplayScreen() {
  const logout = useAuthStore((s) => s.logout);
  const { layout, loading: layoutLoading } = useVenueLayout();
  const { board, loading: boardLoading } = useOrderBoard();
  const [chrome, setChrome] = useState(true);

  const prefs = useMemo(() => {
    if (board.cartina?.placements.length) {
      return resolveOrderCartina(layout, board.cartina);
    }
    return resolveOrderCartina(layout, loadCartinaPrefs(layout));
  }, [board.cartina, layout]);

  // Auto-nascondi highlight dopo 25s
  useEffect(() => {
    if (!board.highlight) return;
    const t = window.setTimeout(() => {
      void clearOrderHighlight();
    }, 25000);
    return () => window.clearTimeout(t);
  }, [board.highlight?.at, board.highlight?.orderNumber]);

  if (layoutLoading || boardLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white">
        <div className="h-10 w-10 animate-pulse rounded-2xl bg-[var(--forest)]/20" />
      </div>
    );
  }

  const hl = board.highlight;

  return (
    <div
      className="relative flex min-h-dvh flex-col bg-white"
      onClick={() => setChrome((c) => !c)}
    >
      {chrome ? (
        <div className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              logout();
              toast.success("Disconnesso");
            }}
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black/5 text-[var(--forest)]"
            aria-label="Esci"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--forest)]">
            Schermo servizio
          </p>
          <h1 className="text-xl font-bold text-[var(--forest-ink)]">
            Cartina ordini
          </h1>
        </div>
        {hl ? (
          <div
            className={`rounded-2xl px-4 py-2 text-center ${
              hl.found
                ? "bg-amber-500 text-white"
                : "bg-red-600 text-white"
            }`}
          >
            <p className="text-[10px] font-semibold uppercase opacity-90">
              {hl.found ? "Ordine" : "Non in cartina"}
            </p>
            <p className="text-3xl font-black leading-none">{hl.orderNumber}</p>
          </div>
        ) : (
          <p className="text-sm text-[var(--forest-muted)]">In attesa tastierino…</p>
        )}
      </div>

      <div className="min-h-0 flex-1 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="h-full min-h-[70vh] overflow-hidden rounded-2xl border border-[var(--forest)]/10">
          <OrderCartinaView
            layout={layout}
            prefs={prefs}
            assignments={board.assignments}
            highlight={board.highlight}
          />
        </div>
      </div>
    </div>
  );
}
