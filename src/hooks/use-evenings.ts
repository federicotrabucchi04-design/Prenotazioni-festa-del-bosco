"use client";

import { useEffect, useState } from "react";
import { subscribeEvenings } from "@/lib/evenings";
import type { ArchiveSummary, Evening } from "@/lib/types";

export function useEvenings() {
  const [active, setActive] = useState<Evening | null>(null);
  const [evenings, setEvenings] = useState<Evening[]>([]);
  const [archives, setArchives] = useState<ArchiveSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeEvenings(({ active: a, evenings: e, archives: ar }) => {
      setActive(a);
      setEvenings(e);
      setArchives(ar);
      setLoading(false);
    });
    return unsub;
  }, []);

  return { active, evenings, archives, loading };
}
