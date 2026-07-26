"use client";

import { LayoutGrid, List, MapPinned, Settings2 } from "lucide-react";
import { useUiStore } from "@/store/ui-store";
import { canEditReservations, useAuthStore } from "@/store/auth-store";
import type { AppView } from "@/lib/types";

export function BottomNav() {
  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);
  const openSettings = useUiStore((s) => s.openSettings);
  const role = useAuthStore((s) => s.role);
  const isAdmin = canEditReservations(role);

  const items: { id: AppView; label: string; icon: typeof List }[] = [
    { id: "list", label: "Lista", icon: List },
    { id: "map", label: "Mappa", icon: LayoutGrid },
    ...(isAdmin
      ? [{ id: "zones" as const, label: "Zone", icon: MapPinned }]
      : []),
  ];

  const cols = items.length + (isAdmin ? 1 : 0);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/40 bg-white/70 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl">
      <div
        className="mx-auto grid max-w-lg gap-2"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {items.map(({ id, label, icon: Icon }) => {
          const active = view === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={`flex h-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-semibold transition active:scale-[0.97] sm:flex-row sm:gap-2 sm:text-sm ${
                active
                  ? "bg-[var(--forest)] text-white shadow-md shadow-[var(--forest)]/25"
                  : "bg-transparent text-[var(--forest-muted)]"
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={2.25} />
              {label}
            </button>
          );
        })}
        {isAdmin ? (
          <button
            type="button"
            onClick={openSettings}
            className="flex h-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-semibold text-[var(--forest-muted)] transition active:scale-[0.97] sm:flex-row sm:gap-2 sm:text-sm"
          >
            <Settings2 className="h-5 w-5" strokeWidth={2.25} />
            Set
          </button>
        ) : null}
      </div>
    </nav>
  );
}
