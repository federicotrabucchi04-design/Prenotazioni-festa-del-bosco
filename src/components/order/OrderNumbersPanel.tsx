"use client";

import { useMemo } from "react";
import { X } from "lucide-react";
import type { OrderAssignments } from "@/lib/order-board";
import {
  formatNumberRuns,
  nearbyExtras,
  searchWindowEntries,
  summarizeBuoni,
} from "@/lib/order-tracking";
import {
  colorForOrderNumber,
  type OrderColorRange,
} from "@/lib/app-settings";

/** Pannello Ordini (cerca) o Buoni (semplice) */
export function OrderNumbersPanel({
  assignments,
  start,
  searchAhead,
  recentExtras,
  colorRanges,
  variant = "setup",
}: {
  assignments: OrderAssignments;
  start: number;
  searchAhead: number;
  /** Distanza max dal prossimo per mostrare “già trovati” (Buoni) */
  recentExtras: number;
  colorRanges: OrderColorRange[];
  variant?: "setup" | "buoni";
}) {
  const summary = useMemo(
    () => summarizeBuoni(assignments, start),
    [assignments, start],
  );
  const window = useMemo(
    () => searchWindowEntries(assignments, start, searchAhead),
    [assignments, start, searchAhead],
  );
  const nearFound = useMemo(
    () => nearbyExtras(summary, recentExtras),
    [summary, recentExtras],
  );
  const isBuoni = variant === "buoni";

  if (isBuoni) {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-6 overflow-y-auto px-4 pb-8 pt-4 md:px-8">
        <div className="rounded-3xl border border-white bg-white/95 p-6 shadow-sm md:p-10">
          <p className="text-sm font-semibold uppercase tracking-wide text-[var(--forest-muted)]">
            Fatti fino al
          </p>
          <p className="mt-2 font-black tabular-nums leading-none text-[var(--forest-ink)] text-[clamp(3rem,16vw,6rem)]">
            {summary.through != null ? summary.through : "—"}
          </p>
        </div>

        {nearFound.length > 0 ? (
          <div className="rounded-3xl border border-amber-200/80 bg-amber-50/90 p-6 shadow-sm md:p-8">
            <p className="text-sm font-semibold uppercase tracking-wide text-amber-800/80">
              Già trovati
            </p>
            <p className="mt-3 font-black tabular-nums leading-tight text-amber-950 text-[clamp(1.75rem,8vw,3rem)]">
              {formatNumberRuns(nearFound)}
            </p>
            <p className="mt-2 text-sm text-amber-900/70">
              Entro {recentExtras} dal prossimo ({summary.next})
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1 pb-2">
      <div className="rounded-3xl bg-[var(--forest)] p-4 text-white shadow-md">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/75">
          Prossimo da cercare
        </p>
        <p className="mt-1 text-5xl font-black tabular-nums leading-none md:text-6xl">
          {summary.next}
        </p>
        {summary.through != null ? (
          <p className="mt-2 text-sm text-white/80">
            Completi fino al {summary.through}
          </p>
        ) : (
          <p className="mt-2 text-sm text-white/80">Parti dal numero {start}</p>
        )}
      </div>

      <div className="rounded-3xl border border-white bg-white/95 p-4 shadow-sm">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--forest-muted)]">
          Sequenza · croce = già trovato
        </p>
        <div className="grid grid-cols-10 gap-1 sm:gap-1.5">
          {window.map(({ n, found }) => {
            const isNext = !found && n === summary.next;
            return (
              <span
                key={n}
                className={`relative flex aspect-square w-full items-center justify-center rounded-xl font-black tabular-nums sm:rounded-2xl ${
                  found
                    ? "bg-neutral-100 text-neutral-400"
                    : isNext
                      ? "bg-[var(--forest)] text-sm text-white sm:text-base"
                      : "bg-[var(--forest)]/10 text-xs sm:text-sm"
                }`}
                style={
                  found || isNext
                    ? undefined
                    : { color: colorForOrderNumber(n, colorRanges) }
                }
                title={found ? `Già trovato: ${n}` : `Da cercare: ${n}`}
              >
                <span className={found ? "opacity-50" : undefined}>{n}</span>
                {found ? (
                  <span
                    className="pointer-events-none absolute inset-0 flex items-center justify-center"
                    aria-hidden
                  >
                    <X
                      className="h-[80%] w-[80%] text-red-600"
                      strokeWidth={3}
                    />
                  </span>
                ) : null}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
