"use client";

import { useEffect, useState } from "react";
import { subscribeReservations } from "@/lib/reservations";
import type { Reservation } from "@/lib/types";

export function useReservations() {
  const [items, setItems] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeReservations((next) => {
      setItems(next);
      setLoading(false);
      setError(null);
    });
    return unsubscribe;
  }, []);

  return { items, loading, error, setError };
}
