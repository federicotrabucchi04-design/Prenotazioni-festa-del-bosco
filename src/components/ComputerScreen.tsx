"use client";

import { LogOut, Monitor } from "lucide-react";
import type { ReactNode } from "react";
import toast from "react-hot-toast";
import { useAuthStore } from "@/store/auth-store";
import { OrderDisplayScreen } from "@/components/order/OrderDisplayScreen";
import { OrderKeypadScreen } from "@/components/order/OrderKeypadScreen";
import { OrderSetupScreen } from "@/components/order/OrderSetupScreen";
import { ReservationList } from "@/components/reservations/ReservationList";
import { ReservationModal } from "@/components/reservations/ReservationModal";
import { AssignTablePicker } from "@/components/reservations/AssignTablePicker";

/**
 * Profilo computer: quattro pannelli contemporanei (angoli dello schermo).
 * Ideale per un PC fisso in sala con un solo login.
 */
export function ComputerScreen() {
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="flex h-dvh w-dvw flex-col overflow-hidden bg-[var(--forest-ink)]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[var(--forest)] px-3 py-1.5 text-white">
        <div className="flex min-w-0 items-center gap-2">
          <Monitor className="h-4 w-4 shrink-0 opacity-90" />
          <p className="truncate text-xs font-semibold tracking-wide">
            Computer · 4 pannelli · Schermo · Tastierino · Staff · Ordini
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            logout();
            toast.success("Disconnesso");
          }}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white/15 px-2.5 text-xs font-semibold"
          aria-label="Esci"
        >
          <LogOut className="h-3.5 w-3.5" />
          Esci
        </button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-px bg-black/40">
        <Pane label="Schermo">
          <OrderDisplayScreen embedded />
        </Pane>
        <Pane label="Tastierino">
          <OrderKeypadScreen embedded />
        </Pane>
        <Pane label="Staff">
          <div className="h-full overflow-y-auto bg-[var(--forest-bg)]">
            <ReservationList compact />
          </div>
        </Pane>
        <Pane label="Ordini">
          <OrderSetupScreen embedded />
        </Pane>
      </div>

      <ReservationModal />
      <AssignTablePicker />
    </div>
  );
}

function Pane({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="relative min-h-0 min-w-0 overflow-hidden bg-white">
      <div className="pointer-events-none absolute left-1.5 top-1.5 z-20 rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
        {label}
      </div>
      <div className="h-full w-full">{children}</div>
    </section>
  );
}
