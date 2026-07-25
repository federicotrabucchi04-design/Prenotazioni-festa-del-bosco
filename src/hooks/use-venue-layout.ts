"use client";

import { useEffect, useState } from "react";
import { subscribeLayout } from "@/lib/layout";
import { createDefaultLayout } from "@/lib/layout-utils";
import type { VenueLayout } from "@/lib/types";

export function useVenueLayout() {
  const [layout, setLayout] = useState<VenueLayout>(createDefaultLayout);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    return subscribeLayout((next) => {
      setLayout(next);
      setLoading(false);
    });
  }, []);

  return { layout, loading };
}
