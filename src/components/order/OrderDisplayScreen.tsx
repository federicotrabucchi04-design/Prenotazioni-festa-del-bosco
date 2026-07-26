"use client";

import { useEffect, useMemo, useState } from "react";
import { LogOut } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "@/store/auth-store";
import { useVenueLayout } from "@/hooks/use-venue-layout";
import { useOrderBoard } from "@/hooks/use-order-board";
import { useAppSettings } from "@/hooks/use-app-settings";
import {
  OrderCartinaView,
  resolveOrderCartina,
} from "@/components/order/OrderCartinaView";
import { loadCartinaPrefs } from "@/lib/cartina";
import { clearOrderHighlight } from "@/lib/order-board";

/** Schermo a tutto schermo: cartina + cerchio (durata/colore da Impostazioni) */
export function OrderDisplayScreen() {
  const logout = useAuthStore((s) => s.logout);
  const { layout, loading: layoutLoading } = useVenueLayout();
  const { board, loading: boardLoading } = useOrderBoard();
  const { settings } = useAppSettings();
  const [showExit, setShowExit] = useState(false);

  const prefs = useMemo(() => {
    if (board.cartina?.placements.length) {
      return resolveOrderCartina(layout, board.cartina);
    }
    return resolveOrderCartina(layout, loadCartinaPrefs(layout));
  }, [board.cartina, layout]);

  const highlightMs = settings.orderHighlightSeconds * 1000;
  const highlightColor = settings.orderHighlightColor;

  useEffect(() => {
    if (!board.highlight) return;
    const elapsed = Date.now() - board.highlight.at;
    const remaining = Math.max(0, highlightMs - elapsed);
    if (remaining === 0) {
      void clearOrderHighlight();
      return;
    }
    const t = window.setTimeout(() => {
      void clearOrderHighlight();
    }, remaining);
    return () => window.clearTimeout(t);
  }, [board.highlight?.at, board.highlight?.orderNumber, highlightMs]);

  if (layoutLoading || boardLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white">
        <div className="h-10 w-10 animate-pulse rounded-2xl bg-[var(--forest)]/20" />
      </div>
    );
  }

  const hl = board.highlight;
  const showCircle = Boolean(hl?.found);

  return (
    <div
      className="relative h-dvh w-full overflow-hidden bg-white"
      onClick={() => setShowExit((v) => !v)}
    >
      <div className="absolute inset-0">
        <OrderCartinaView
          layout={layout}
          prefs={prefs}
          assignments={board.assignments}
          highlight={board.highlight}
          highlightColor={highlightColor}
          variant="display"
          className="h-full w-full"
        />
      </div>

      {hl ? (
        <div
          className="pointer-events-none absolute left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] z-30 -translate-x-1/2 rounded-2xl px-5 py-2.5 text-center text-white shadow-lg"
          style={{ backgroundColor: showCircle ? highlightColor : "#7f1d1d" }}
        >
          <p className="text-[11px] font-bold uppercase tracking-wide opacity-90">
            {showCircle ? "Ordine" : "Non assegnato"}
          </p>
          <p className="text-4xl font-black leading-none">{hl.orderNumber}</p>
        </div>
      ) : null}

      {showExit ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            logout();
            toast.success("Disconnesso");
          }}
          className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-40 flex h-11 w-11 items-center justify-center rounded-2xl bg-black/50 text-white"
          aria-label="Esci"
        >
          <LogOut className="h-5 w-5" />
        </button>
      ) : null}
    </div>
  );
}
