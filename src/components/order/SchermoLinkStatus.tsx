"use client";

import { Monitor } from "lucide-react";
import { useSchermoPresence } from "@/hooks/use-schermo-presence";
import { useOnlineStatus } from "@/hooks/use-online-status";

/** Stato del sito/sessione Schermo (TV): attivo e in sync oppure offline */
export function SchermoLinkStatus({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  const { online: schermoOnline } = useSchermoPresence();
  const selfOnline = useOnlineStatus();

  const active = selfOnline && schermoOnline;
  const label = !selfOnline
    ? "Schermo: sei offline"
    : active
      ? "Schermo aperto · attivo e sincronizzato"
      : "Schermo offline";

  return (
    <div
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide ${
        active
          ? "bg-emerald-100 text-emerald-900"
          : "bg-amber-100 text-amber-950"
      } ${className}`}
      title={
        active
          ? "Il sito Schermo è aperto e riceve gli aggiornamenti"
          : selfOnline
            ? "Nessuno Schermo connesso (apri il profilo Schermo su TV/tablet)"
            : "Questo device è offline: non puoi verificare lo Schermo"
      }
      role="status"
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          active ? "bg-emerald-500" : "bg-amber-500 animate-pulse"
        }`}
        aria-hidden
      />
      <Monitor className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
      <span className="truncate">{compact ? (active ? "Schermo attivo" : label) : label}</span>
    </div>
  );
}
