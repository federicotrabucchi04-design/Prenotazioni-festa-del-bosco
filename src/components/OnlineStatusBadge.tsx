"use client";

import { useOnlineStatus } from "@/hooks/use-online-status";
import { pendingOfflineWrites } from "@/lib/offline-sync";
import { useEffect, useState } from "react";

/** Spia online (verde) / offline (rosso) per le intestazioni di ogni profilo */
export function OnlineStatusBadge({
  variant = "light",
  className = "",
}: {
  variant?: "light" | "dark";
  className?: string;
}) {
  const online = useOnlineStatus();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const tick = () => setPending(pendingOfflineWrites());
    tick();
    const id = window.setInterval(tick, 1500);
    window.addEventListener("online", tick);
    window.addEventListener("offline", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("online", tick);
      window.removeEventListener("offline", tick);
    };
  }, [online]);

  const label = online ? "Online" : "Offline";
  const dark = variant === "dark";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        online
          ? dark
            ? "bg-emerald-500/25 text-emerald-100"
            : "bg-emerald-100 text-emerald-800"
          : dark
            ? "bg-red-500/30 text-red-100"
            : "bg-red-100 text-red-800"
      } ${className}`}
      title={
        pending > 0
          ? `${pending} modifiche in coda da sincronizzare`
          : online
            ? "Connesso"
            : "Senza rete — salvataggio locale temporaneo"
      }
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          online ? "bg-emerald-500" : "bg-red-500"
        } ${online ? "" : "animate-pulse"}`}
        aria-hidden
      />
      {label}
      {pending > 0 ? (
        <span className="normal-case tracking-normal opacity-80">
          · {pending}
        </span>
      ) : null}
    </span>
  );
}
