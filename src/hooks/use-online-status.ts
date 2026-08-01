"use client";

import { useSyncExternalStore } from "react";
import { getOnline, subscribeOnlineStatus } from "@/lib/offline-sync";

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribeOnlineStatus,
    getOnline,
    () => true,
  );
}
