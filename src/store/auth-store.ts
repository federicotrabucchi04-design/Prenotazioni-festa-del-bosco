"use client";

import { AUTH_STORAGE_KEY } from "@/lib/constants";
import { getAppSettings } from "@/lib/app-settings";
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

function resolveRoleFromPin(normalized: string): UserRole | null {
  const { pins } = getAppSettings();
  if (normalized === pins.admin) return "admin";
  if (normalized === pins.staff) return "staff";
  if (normalized === pins.orderSetup) return "orderSetup";
  if (normalized === pins.orderDisplay) return "orderDisplay";
  if (normalized === pins.orderKeypad) return "orderKeypad";
  return null;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      role: null,
      hydrated: false,
      login: (pin) => {
        const normalized = pin.trim().toUpperCase();
        const role = resolveRoleFromPin(normalized);
        if (!role) return { ok: false, error: "PIN non valido" };
        set({ role });
        return { ok: true, role };
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
