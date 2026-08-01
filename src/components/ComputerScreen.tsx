"use client";

import { LogOut, Monitor } from "lucide-react";
import type { ReactNode } from "react";
import toast from "react-hot-toast";
import { useAuthStore } from "@/store/auth-store";
import { useViewport } from "@/hooks/use-viewport";
import { OrderDisplayScreen } from "@/components/order/OrderDisplayScreen";
import { OrderKeypadScreen } from "@/components/order/OrderKeypadScreen";
import { OrderSetupScreen } from "@/components/order/OrderSetupScreen";
import { ReservationList } from "@/components/reservations/ReservationList";
import { ReservationModal } from "@/components/reservations/ReservationModal";
import { AssignTablePicker } from "@/components/reservations/AssignTablePicker";

/**
 * Profilo computer: quattro pannelli (PC widescreen).
 * Su schermi stretti avvisa di usare i PIN dedicati per device.
 */
export function ComputerScreen() {
  const logout = useAuthStore((s) => s.logout);
  const { width, isPhone } = useViewport();
  const cramped = width < 900 || isPhone;

  if (cramped) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--forest-bg)] px-6 text-center">
        <Monitor className="h-10 w-10 text-[var(--forest)]" />
        <div>
          <h1 className="text-lg font-semibold text-[var(--forest-ink)]">
            Profilo Computer
          </h1>
          <p className="mt-2 max-w-sm text-sm text-[var(--forest-muted)]">
            Serve uno schermo largo (PC). Su telefono usa Staff / Tastierino; su
            tablet Ordini; su TV verticale Schermo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            logout();
            toast.success("Disconnesso");
          }}
          className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[var(--forest)] px-5 text-sm font-semibold text-white"
        >
          <LogOut className="h-4 w-4" />
          Torna al login
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-dvh w-dvw flex-col overflow-hidden bg-[var(--forest-ink)]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[var(--forest)] px-3 py-1.5 text-white">
        <div className="flex min-w-0 items-center gap-2">
          <Monitor className="h-4 w-4 shrink-0 opacity-90" />
          <p className="truncate text-xs font-semibold tracking-wide">
            Computer · Schermo · Tastierino · Staff · Ordini
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
        <Pane label="Schermo (TV)">
          <OrderDisplayScreen embedded />
        </Pane>
        <Pane label="Tastierino (telefono)">
          <OrderKeypadScreen embedded />
        </Pane>
        <Pane label="Staff (prenotazioni)">
          <div className="h-full overflow-y-auto bg-[var(--forest-bg)]">
            <ReservationList compact />
          </div>
        </Pane>
        <Pane label="Ordini (tablet)">
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
