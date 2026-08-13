"use client";

import { useSyncExternalStore } from "react";
import {
  getSchermoPresence,
  subscribeSchermoPresence,
  type SchermoPresence,
} from "@/lib/order-presence";

export function useSchermoPresence(): SchermoPresence {
  return useSyncExternalStore(
    subscribeSchermoPresence,
    getSchermoPresence,
    () => ({ online: false, at: 0 }),
  );
}
