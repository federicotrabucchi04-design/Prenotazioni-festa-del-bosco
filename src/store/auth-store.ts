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

const PIN_TO_ROLE: { pin: string; role: UserRole }[] = [
  { pin: PINS.admin, role: "admin" },
  { pin: PINS.staff, role: "staff" },
  { pin: PINS.orderSetup, role: "orderSetup" },
  { pin: PINS.orderDisplay, role: "orderDisplay" },
  { pin: PINS.orderKeypad, role: "orderKeypad" },
];

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      role: null,
      hydrated: false,
      login: (pin) => {
        const normalized = pin.trim().toUpperCase();
        const match = PIN_TO_ROLE.find((p) => p.pin === normalized);
        if (!match) return { ok: false, error: "PIN non valido" };
        set({ role: match.role });
        return { ok: true, role: match.role };
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

export function isOrderRole(role: UserRole | null) {
  return (
    role === "orderSetup" ||
    role === "orderDisplay" ||
    role === "orderKeypad"
  );
}

export function orderRoleLabel(role: UserRole) {
  switch (role) {
    case "orderSetup":
      return "Assegna ordini";
    case "orderDisplay":
      return "Schermo cartina";
    case "orderKeypad":
      return "Tastierino";
    case "admin":
      return "Admin";
    case "staff":
      return "Staff";
  }
}
