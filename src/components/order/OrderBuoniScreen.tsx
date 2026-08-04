"use client";

import { LogOut } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore, orderRoleLabel } from "@/store/auth-store";
import { useOrderBoard } from "@/hooks/use-order-board";
import { useAppSettings } from "@/hooks/use-app-settings";
import { OnlineStatusBadge } from "@/components/OnlineStatusBadge";
import { OrderNumbersPanel } from "@/components/order/OrderNumbersPanel";

/** Profilo sola lettura: stato buoni / numeri trovati */
export function OrderBuoniScreen({ embedded = false }: { embedded?: boolean }) {
  const logout = useAuthStore((s) => s.logout);
  const role = useAuthStore((s) => s.role)!;
  const { board, loading } = useOrderBoard();
  const { settings } = useAppSettings();

  if (loading) {
    return (
      <div
        className={`flex items-center justify-center bg-[var(--forest-bg)] ${
          embedded ? "h-full" : "min-h-dvh"
        }`}
      >
        <div className="h-10 w-10 animate-pulse rounded-2xl bg-[var(--forest)]/20" />
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col bg-[var(--forest-bg)] ${
        embedded ? "h-full overflow-hidden" : "h-dvh max-h-dvh overflow-hidden"
      }`}
    >
      {!embedded ? (
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/50 bg-white/80 px-4 pb-3 pt-[max(0.85rem,env(safe-area-inset-top))] backdrop-blur-xl md:px-6">
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--forest)]">
                Solo visualizzazione
              </p>
              <OnlineStatusBadge />
            </div>
            <h1 className="text-lg font-semibold text-[var(--forest-ink)] md:text-xl">
              {orderRoleLabel(role)}
            </h1>
            <p className="text-sm text-[var(--forest-muted)]">
              Numeri già trovati e prossimo da cercare
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              logout();
              toast.success("Disconnesso");
            }}
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--forest)]/8 text-[var(--forest)] touch-manipulation"
            aria-label="Esci"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </header>
      ) : (
        <div className="shrink-0 border-b border-white/40 bg-white/80 px-2 pb-1 pt-6">
          <p className="text-[10px] font-semibold text-[var(--forest-muted)]">
            Buoni · sola lettura
          </p>
        </div>
      )}

      <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col">
        <OrderNumbersPanel
          assignments={board.assignments}
          start={settings.orderNumberStart}
          searchAhead={settings.orderSearchAhead}
          recentExtras={settings.orderRecentExtras}
          colorRanges={settings.orderColorRanges}
          variant="buoni"
        />
      </div>
    </div>
  );
}
