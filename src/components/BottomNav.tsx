"use client";

import { LayoutGrid, List, MapPinned } from "lucide-react";
import { useUiStore } from "@/store/ui-store";
import { canEditReservations, useAuthStore } from "@/store/auth-store";
import type { AppView } from "@/lib/types";

export function BottomNav() {
  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);
  const role = useAuthStore((s) => s.role);
  const isAdmin = canEditReservations(role);

  const items: { id: AppView; label: string; icon: typeof List }[] = [
    { id: "list", label: "Lista", icon: List },
    { id: "map", label: "Mappa", icon: LayoutGrid },
    ...(isAdmin
      ? [{ id: "zones" as const, label: "Zone", icon: MapPinned }]
      : []),
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/40 bg-white/70 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl">
      <div
        className={`mx-auto grid max-w-lg gap-2 ${
          items.length === 3 ? "grid-cols-3" : "grid-cols-2"
        }`}
      >
        {items.map(({ id, label, icon: Icon }) => {
          const active = view === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={`flex h-14 items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition active:scale-[0.97] ${
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
      </div>
    </nav>
  );
}
