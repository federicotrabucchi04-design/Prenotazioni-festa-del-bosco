"use client";

import { AUTH_STORAGE_KEY, PINS } from "@/lib/constants";
import type { UserRole } from "@/lib/types";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  role: UserRole | null;
  hydrated: boolean;
  login: (pin: string) => { ok: true; role: UserRole } | { ok: false; error: string };
  logout: () => void;
  setHydrated: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      role: null,
      hydrated: false,
      login: (pin) => {
        const normalized = pin.trim().toUpperCase();
        if (normalized === PINS.admin) {
          set({ role: "admin" });
          return { ok: true, role: "admin" as const };
        }
        if (normalized === PINS.staff) {
          set({ role: "staff" });
          return { ok: true, role: "staff" as const };
        }
        return { ok: false, error: "PIN non valido" };
      },
      logout: () => set({ role: null }),
      setHydrated: (value) => set({ hydrated: value }),
    }),
    {
      name: AUTH_STORAGE_KEY,
      partialize: (state) => ({ role: state.role }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);

export function canEditReservations(role: UserRole | null) {
  return role === "admin";
}
