"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { LoginScreen } from "@/components/LoginScreen";
import { ReservationList } from "@/components/reservations/ReservationList";
import { ReservationModal } from "@/components/reservations/ReservationModal";
import { AssignTablePicker } from "@/components/reservations/AssignTablePicker";
import { TablesMap } from "@/components/map/TablesMap";
import { GlobalCartina } from "@/components/map/GlobalCartina";
import { ZoneEditor } from "@/components/zones/ZoneEditor";
import { OrderSetupScreen } from "@/components/order/OrderSetupScreen";
import { OrderDisplayScreen } from "@/components/order/OrderDisplayScreen";
import { OrderKeypadScreen } from "@/components/order/OrderKeypadScreen";
import {
  useAuthStore,
  canEditReservations,
  isOrderRole,
} from "@/store/auth-store";
import { useUiStore } from "@/store/ui-store";
import { useEvenings } from "@/hooks/use-evenings";
import { EVENT_DATE } from "@/lib/constants";
import { subscribeAppSettings } from "@/lib/app-settings";

export function App() {
  const role = useAuthStore((s) => s.role);
  const hydrated = useAuthStore((s) => s.hydrated);
  const setHydrated = useAuthStore((s) => s.setHydrated);
  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);
  const isAdmin = canEditReservations(role);
  const { active: activeEvening } = useEvenings();

  useEffect(() => {
    const finish = () => setHydrated(true);
    const unsub = useAuthStore.persist.onFinishHydration(finish);
    if (useAuthStore.persist.hasHydrated()) finish();
    return unsub;
  }, [setHydrated]);

  useEffect(() => {
    return subscribeAppSettings(() => {
      // tiene aggiornata la cache PIN / regole
    });
  }, []);

  useEffect(() => {
    if (view === "zones" && !isAdmin) setView("list");
  }, [view, isAdmin, setView]);

  if (!hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--forest-bg)]">
        <div className="h-10 w-10 animate-pulse rounded-2xl bg-[var(--forest)]/20" />
      </div>
    );
  }

  if (!role) {
    return <LoginScreen />;
  }

  if (isOrderRole(role)) {
    if (role === "orderSetup") return <OrderSetupScreen />;
    if (role === "orderDisplay") return <OrderDisplayScreen />;
    return <OrderKeypadScreen />;
  }

  const title =
    view === "list"
      ? "Lista prenotazioni"
      : view === "map"
        ? "Mappa tavoli"
        : "Modifica zone";

  return (
    <div className="min-h-dvh bg-[var(--forest-bg)] text-[var(--forest-ink)]">
      <AppHeader
        title={title}
        subtitle={`Sera del ${activeEvening?.label ?? EVENT_DATE}`}
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          className="min-w-0"
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ type: "spring", stiffness: 280, damping: 28 }}
        >
          {view === "list" ? (
            <ReservationList />
          ) : view === "map" ? (
            <TablesMap />
          ) : (
            <ZoneEditor />
          )}
        </motion.div>
      </AnimatePresence>

      <BottomNav />
      <ReservationModal />
      <AssignTablePicker />
      <GlobalCartina />
    </div>
  );
}
