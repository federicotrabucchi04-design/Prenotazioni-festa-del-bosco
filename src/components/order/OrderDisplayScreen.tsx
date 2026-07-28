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
import { clearOrderHighlightIf } from "@/lib/order-board";

/** Schermo a tutto schermo: cartina edge-to-edge + cerchio da impostazioni */
export function OrderDisplayScreen({ embedded = false }: { embedded?: boolean }) {
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
    const startedAt = board.highlight.at;
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(0, highlightMs - elapsed);
    if (remaining === 0) {
      void clearOrderHighlightIf(startedAt);
      return;
    }
    const t = window.setTimeout(() => {
      void clearOrderHighlightIf(startedAt);
    }, remaining);
    return () => window.clearTimeout(t);
  }, [board.highlight?.at, board.highlight?.orderNumber, highlightMs]);

  if (layoutLoading || boardLoading) {
    return (
      <div
        className={`flex items-center justify-center bg-white ${
          embedded ? "h-full" : "min-h-dvh"
        }`}
      >
        <div className="h-10 w-10 animate-pulse rounded-2xl bg-[var(--forest)]/20" />
      </div>
    );
  }

  const hl = board.highlight;
  const showCircle = Boolean(hl?.found);

  return (
    <div
      className={`relative overflow-hidden bg-white ${
        embedded ? "h-full w-full" : "h-dvh w-dvw"
      }`}
      onClick={() => {
        if (!embedded) setShowExit((v) => !v);
      }}
    >
      <div className="cartina-a4-portrait absolute inset-0">
        <OrderCartinaView
          layout={layout}
          prefs={prefs}
          assignments={board.assignments}
          highlight={board.highlight}
          highlightColor={highlightColor}
          numberScale={
            embedded
              ? Math.max(0.55, settings.orderNumberScale * 0.72)
              : settings.orderNumberScale
          }
          colorRanges={settings.orderColorRanges}
          variant="display"
          className="h-full w-full"
        />
      </div>

      {hl ? (
        <div
          className={`pointer-events-none absolute left-1/2 z-30 -translate-x-1/2 rounded-xl text-center text-white shadow-lg ${
            embedded
              ? "top-1 px-2 py-0.5"
              : "top-2 px-4 py-1.5"
          }`}
          style={{ backgroundColor: showCircle ? highlightColor : "#7f1d1d" }}
        >
          <p
            className={`font-bold uppercase tracking-wide opacity-90 ${
              embedded ? "text-[8px]" : "text-[10px]"
            }`}
          >
            {showCircle ? "Ordine" : "Non assegnato"}
          </p>
          <p
            className={`font-black leading-none ${
              embedded ? "text-xl" : "text-3xl"
            }`}
          >
            {hl.orderNumber}
          </p>
        </div>
      ) : null}

      {!embedded && showExit ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            logout();
            toast.success("Disconnesso");
          }}
          className="absolute right-2 top-2 z-40 flex h-10 w-10 items-center justify-center rounded-xl bg-black/50 text-white"
          aria-label="Esci"
        >
          <LogOut className="h-5 w-5" />
        </button>
      ) : null}
    </div>
  );
}
