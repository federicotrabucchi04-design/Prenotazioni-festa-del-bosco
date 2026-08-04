"use client";

import { useMemo } from "react";
import type { OrderAssignments } from "@/lib/order-board";
import {
  formatBuoniLabelCompact,
  formatNumberRuns,
  nextMissingNumbers,
  summarizeBuoni,
} from "@/lib/order-tracking";
import {
  colorForOrderNumber,
  type OrderColorRange,
} from "@/lib/app-settings";

/** Pannello condiviso: cosa cercare + stato buoni / buchi */
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
  recentExtras: number;
  colorRanges: OrderColorRange[];
  /** setup = Ordini (cerca); buoni = sola lettura grande */
  variant?: "setup" | "buoni";
}) {
  const summary = useMemo(
    () => summarizeBuoni(assignments, start),
    [assignments, start],
  );
  const missing = useMemo(
    () => nextMissingNumbers(assignments, start, searchAhead),
    [assignments, start, searchAhead],
  );
  const extrasShown = summary.extras.slice(
    Math.max(0, summary.extras.length - recentExtras),
  );
  const isBuoni = variant === "buoni";

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto ${
        isBuoni ? "px-4 pb-6 pt-2 md:px-6" : "px-1 pb-2"
      }`}
    >
      <div
        className={`rounded-3xl border border-white bg-white/95 shadow-sm ${
          isBuoni ? "p-5 md:p-7" : "p-4"
        }`}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--forest-muted)]">
          Stato buoni
        </p>
        <p
          className={`mt-2 font-black leading-tight text-[var(--forest-ink)] ${
            isBuoni ? "text-2xl md:text-4xl" : "text-xl md:text-2xl"
          }`}
        >
          {formatBuoniLabelCompact(summary)}
        </p>
        <p className="mt-2 text-sm text-[var(--forest-muted)]">
          {summary.count} numer{summary.count === 1 ? "o" : "i"} sui tavoli
        </p>
      </div>

      <div
        className={`rounded-3xl bg-[var(--forest)] text-white shadow-md ${
          isBuoni ? "p-5 md:p-8" : "p-4"
        }`}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-white/75">
          Prossimo da cercare
        </p>
        <p
          className={`mt-1 font-black tabular-nums leading-none ${
            isBuoni ? "text-[clamp(3.5rem,18vw,7rem)]" : "text-5xl md:text-6xl"
          }`}
        >
          {summary.next}
        </p>
        {summary.through != null ? (
          <p className="mt-2 text-sm text-white/80">
            Completi fino al {summary.through}
            {summary.extras.length > 0
              ? ` · ${summary.extras.length} oltre il buco`
              : ""}
          </p>
        ) : (
          <p className="mt-2 text-sm text-white/80">Parti dal numero {start}</p>
        )}
      </div>

      {!isBuoni || missing.length > 0 ? (
        <div className="rounded-3xl border border-white bg-white/95 p-4 shadow-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--forest-muted)]">
            Da cercare (prossimi {missing.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {missing.map((n, i) => (
              <span
                key={n}
                className={`inline-flex min-w-12 items-center justify-center rounded-2xl px-3 py-2.5 font-black tabular-nums ${
                  i === 0
                    ? "bg-[var(--forest)] text-lg text-white"
                    : "bg-[var(--forest)]/10 text-base text-[var(--forest-ink)]"
                }`}
                style={
                  i === 0
                    ? undefined
                    : { color: colorForOrderNumber(n, colorRanges) }
                }
              >
                {n}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {extrasShown.length > 0 ? (
        <div className="rounded-3xl border border-amber-200/80 bg-amber-50/90 p-4 shadow-sm">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-800/80">
            Oltre il buco (già trovati)
          </p>
          <p className="text-sm text-amber-900/80">
            Mancano numeri prima di questi — non sono in sequenza continua
          </p>
          <p className="mt-3 text-lg font-black tabular-nums text-amber-950 md:text-xl">
            {formatNumberRuns(extrasShown)}
          </p>
        </div>
      ) : null}

      {isBuoni && summary.through != null ? (
        <div className="rounded-3xl border border-emerald-200/80 bg-emerald-50/90 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800/80">
            Sequenza completa
          </p>
          <p className="mt-2 text-2xl font-black tabular-nums text-emerald-950 md:text-3xl">
            {start === summary.through
              ? String(summary.through)
              : `${start}–${summary.through}`}
          </p>
        </div>
      ) : null}
    </div>
  );
}
