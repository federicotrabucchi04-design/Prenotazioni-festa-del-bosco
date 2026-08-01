"use client";

import { useEffect, useMemo, useState } from "react";
import { LogOut } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "@/store/auth-store";
import { useVenueLayout } from "@/hooks/use-venue-layout";
import { useOrderBoard } from "@/hooks/use-order-board";
import { useAppSettings } from "@/hooks/use-app-settings";
import { useViewport } from "@/hooks/use-viewport";
import {
  OrderCartinaView,
  resolveOrderCartina,
} from "@/components/order/OrderCartinaView";
import { loadCartinaPrefs } from "@/lib/cartina";
import { clearOrderHighlightIf } from "@/lib/order-board";

/**
 * Schermo cartina — pensato soprattutto per TV in verticale
 * (lato lungo in verticale): riempie tutto, numeri grandi, cerchio evidente.
 */
export function OrderDisplayScreen({ embedded = false }: { embedded?: boolean }) {
  const logout = useAuthStore((s) => s.logout);
  const { layout, loading: layoutLoading } = useVenueLayout();
  const { board, loading: boardLoading } = useOrderBoard();
  const { settings } = useAppSettings();
  const viewport = useViewport();
  const [showExit, setShowExit] = useState(false);

  const prefs = useMemo(() => {
    if (board.cartina?.placements.length) {
      return resolveOrderCartina(layout, board.cartina);
    }
    return resolveOrderCartina(layout, loadCartinaPrefs(layout));
  }, [board.cartina, layout]);

  const highlightMs = settings.orderHighlightSeconds * 1000;
  const highlightColor = settings.orderHighlightColor;

  /** Scala numeri: più grandi su TV portrait, ridotti nel pannello computer */
  const numberScale = useMemo(() => {
    const base = settings.orderNumberScale;
    if (embedded) return Math.max(0.5, base * 0.68);
    if (viewport.isPortraitDisplay) {
      // TV / monitor verticale: spinge i numeri
      const boost = Math.min(2.2, 0.95 + viewport.height / 1400);
      return Math.max(base, base * boost);
    }
    if (viewport.portrait) return Math.max(base, base * 1.15);
    return base;
  }, [embedded, settings.orderNumberScale, viewport]);

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
  const tvMode = !embedded && viewport.isPortraitDisplay;

  return (
    <div
      className={`order-display-screen relative overflow-hidden bg-white ${
        embedded ? "h-full w-full" : "fixed inset-0 h-dvh w-dvw"
      }`}
      onClick={() => {
        if (!embedded) setShowExit((v) => !v);
      }}
    >
      {/* Cartina a tutto schermo: su TV verticale = foglio pieno */}
      <div className="absolute inset-0">
        <OrderCartinaView
          layout={layout}
          prefs={prefs}
          assignments={board.assignments}
          highlight={board.highlight}
          highlightColor={highlightColor}
          numberScale={numberScale}
          colorRanges={settings.orderColorRanges}
          variant="display"
          className="h-full w-full"
        />
      </div>

      {hl ? (
        <div
          className={`pointer-events-none absolute left-1/2 z-30 -translate-x-1/2 rounded-2xl text-center text-white shadow-xl ${
            embedded
              ? "top-1 px-2 py-0.5"
              : tvMode
                ? "top-[max(0.75rem,env(safe-area-inset-top))] px-6 py-3"
                : "top-2 px-4 py-1.5"
          }`}
          style={{ backgroundColor: showCircle ? highlightColor : "#7f1d1d" }}
        >
          <p
            className={`font-bold uppercase tracking-wide opacity-90 ${
              embedded ? "text-[8px]" : tvMode ? "text-sm sm:text-base" : "text-[10px]"
            }`}
          >
            {showCircle ? "Ordine" : "Non assegnato"}
          </p>
          <p
            className={`font-black leading-none tabular-nums ${
              embedded
                ? "text-xl"
                : tvMode
                  ? "text-[clamp(2.5rem,12vw,6rem)]"
                  : "text-3xl"
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
          className="absolute right-[max(0.5rem,env(safe-area-inset-right))] top-[max(0.5rem,env(safe-area-inset-top))] z-40 flex h-12 w-12 items-center justify-center rounded-xl bg-black/50 text-white"
          aria-label="Esci"
        >
          <LogOut className="h-5 w-5" />
        </button>
      ) : null}
    </div>
  );
}
