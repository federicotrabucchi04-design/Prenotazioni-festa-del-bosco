"use client";

import { useState } from "react";
import { CalendarDays, LogOut, Settings2, Trees } from "lucide-react";
import { getDataMode } from "@/lib/reservations";
import { canEditReservations, useAuthStore } from "@/store/auth-store";
import { useUiStore } from "@/store/ui-store";
import { EveningsPanel } from "@/components/EveningsPanel";
import toast from "react-hot-toast";

export function AppHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const role = useAuthStore((s) => s.role);
  const logout = useAuthStore((s) => s.logout);
  const openSettings = useUiStore((s) => s.openSettings);
  const mode = getDataMode();
  const isAdmin = canEditReservations(role);
  const [eveningsOpen, setEveningsOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-white/40 bg-white/70 px-4 pb-3 pt-[max(0.85rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <Trees className="h-4 w-4 shrink-0 text-[var(--forest)]" />
              <p className="truncate font-[family-name:var(--font-display)] text-sm font-semibold text-[var(--forest)]">
                Feste del Bosco
              </p>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  role === "admin"
                    ? "bg-[var(--forest)] text-white"
                    : "bg-[var(--forest)]/10 text-[var(--forest)]"
                }`}
              >
                {role}
              </span>
              {mode === "demo" && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                  Demo
                </span>
              )}
            </div>
            <h1 className="truncate text-xl font-semibold text-[var(--forest-ink)]">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-0.5 text-sm text-[var(--forest-muted)]">{subtitle}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isAdmin ? (
              <button
                type="button"
                onClick={openSettings}
                className="inline-flex h-11 items-center gap-1.5 rounded-2xl bg-[var(--forest)] px-3 text-sm font-semibold text-white shadow-sm shadow-[var(--forest)]/20 transition active:scale-95"
                aria-label="Impostazioni"
                title="Impostazioni"
              >
                <Settings2 className="h-5 w-5" />
                <span className="hidden xs:inline sm:inline">Set</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setEveningsOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--forest)]/8 text-[var(--forest)] transition active:scale-95"
              aria-label="Gestisci serate"
              title="Gestisci serate"
            >
              <CalendarDays className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => {
                logout();
                toast.success("Disconnesso");
              }}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--forest)]/8 text-[var(--forest)] transition active:scale-95"
              aria-label="Esci"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>
      <EveningsPanel open={eveningsOpen} onClose={() => setEveningsOpen(false)} />
    </>
  );
}
