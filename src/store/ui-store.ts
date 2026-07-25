"use client";

import type { AppView, Reservation, Zone } from "@/lib/types";
import { ZONES } from "@/lib/constants";
import { create } from "zustand";

interface UiState {
  view: AppView;
  selectedZone: Zone;
  search: string;
  editing: Reservation | null;
  modalOpen: boolean;
  assigning: Reservation | null;
  recentlyArrivedIds: Set<string>;
  setView: (view: AppView) => void;
  setSelectedZone: (zone: Zone) => void;
  setSearch: (search: string) => void;
  openCreateModal: () => void;
  openEditModal: (reservation: Reservation) => void;
  closeModal: () => void;
  openAssignTable: (reservation: Reservation) => void;
  closeAssignTable: () => void;
  markRecentlyArrived: (id: string) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  view: "list",
  selectedZone: ZONES[0]!,
  search: "",
  editing: null,
  modalOpen: false,
  assigning: null,
  recentlyArrivedIds: new Set(),
  setView: (view) => set({ view }),
  setSelectedZone: (zone) => set({ selectedZone: zone }),
  setSearch: (search) => set({ search }),
  openCreateModal: () => set({ modalOpen: true, editing: null }),
  openEditModal: (reservation) =>
    set({ modalOpen: true, editing: reservation }),
  closeModal: () => set({ modalOpen: false, editing: null }),
  openAssignTable: (reservation) => {
    const zone = reservation.zone || get().selectedZone;
    set({ assigning: reservation, selectedZone: zone || get().selectedZone });
  },
  closeAssignTable: () => set({ assigning: null }),
  markRecentlyArrived: (id) => {
    const next = new Set(get().recentlyArrivedIds);
    next.add(id);
    set({ recentlyArrivedIds: next });
    window.setTimeout(() => {
      const cleaned = new Set(get().recentlyArrivedIds);
      cleaned.delete(id);
      set({ recentlyArrivedIds: cleaned });
    }, 2500);
  },
}));

export function isTableAssigned(reservation: Pick<Reservation, "tableNumber">) {
  return Number(reservation.tableNumber) > 0;
}
