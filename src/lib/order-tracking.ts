import type { OrderAssignments } from "@/lib/order-board";

/** Numeri ordine attualmente assegnati ai tavoli (unici, ordinati). */
export function collectFoundNumbers(assignments: OrderAssignments): number[] {
  const set = new Set<number>();
  for (const list of Object.values(assignments)) {
    for (const n of list) {
      if (Number.isFinite(n) && n > 0) set.add(Math.floor(n));
    }
  }
  return [...set].sort((a, b) => a - b);
}

export interface BuoniSummary {
  /** Ultimo numero consecutivo dal punto di partenza (null se nessuno) */
  through: number | null;
  /** Trovati oltre il “fino a”, tipicamente dopo un buco */
  extras: number[];
  /** Tutti i trovati ordinati */
  found: number[];
  /** Totale trovati */
  count: number;
  /** Prossimo da cercare (primo mancante) */
  next: number;
}

/**
 * Es. trovati 1…48,50,51,54 → through=48, extras=[50,51,54], next=49
 */
export function summarizeBuoni(
  assignments: OrderAssignments,
  start = 1,
): BuoniSummary {
  const found = collectFoundNumbers(assignments);
  const set = new Set(found);
  let through: number | null = null;
  let cursor = Math.max(1, Math.floor(start));
  while (set.has(cursor)) {
    through = cursor;
    cursor += 1;
  }
  const extras = found.filter((n) => through == null || n > through);
  return {
    through,
    extras,
    found,
    count: found.length,
    next: cursor,
  };
}

/** Finestra da mostrare in Ordini: include anche i già trovati (con croce). */
export function searchWindowEntries(
  assignments: OrderAssignments,
  start: number,
  missingTarget: number,
): { n: number; found: boolean }[] {
  const set = new Set(collectFoundNumbers(assignments));
  const { next } = summarizeBuoni(assignments, start);
  const out: { n: number; found: boolean }[] = [];
  let n = next;
  let missing = 0;
  const limit = Math.max(1, Math.floor(missingTarget));
  const hardStop = n + limit + 3000;
  while (missing < limit && n < hardStop) {
    const found = set.has(n);
    out.push({ n, found });
    if (!found) missing += 1;
    n += 1;
  }
  return out;
}

/** Extras vicini al prossimo da cercare (distanza &lt; near). */
export function nearbyExtras(
  summary: BuoniSummary,
  near = 20,
): number[] {
  const dist = Math.max(0, Math.floor(near));
  return summary.extras.filter((n) => n - summary.next < dist);
}

/** Testo leggibile: "Fatti fino al 48 + 50, 51, 54" */
export function formatBuoniLabel(summary: BuoniSummary): string {
  if (summary.count === 0) return "Nessun numero ancora";
  const parts: string[] = [];
  if (summary.through != null) {
    parts.push(`Fatti fino al ${summary.through}`);
  }
  if (summary.extras.length > 0) {
    const extra = summary.extras.join(", ");
    parts.push(parts.length ? `+ ${extra}` : extra);
  }
  return parts.join(" ") || "Nessun numero ancora";
}

/** Comprimi extras in range dove possibile: [50,51,54] → "50–51, 54" */
export function formatNumberRuns(nums: number[]): string {
  if (nums.length === 0) return "";
  const runs: string[] = [];
  let i = 0;
  while (i < nums.length) {
    const a = nums[i]!;
    let b = a;
    while (i + 1 < nums.length && nums[i + 1] === b + 1) {
      i += 1;
      b = nums[i]!;
    }
    runs.push(a === b ? String(a) : `${a}–${b}`);
    i += 1;
  }
  return runs.join(", ");
}

export function formatBuoniLabelCompact(summary: BuoniSummary): string {
  if (summary.count === 0) return "Nessun numero ancora";
  const parts: string[] = [];
  if (summary.through != null) {
    parts.push(`Fatti fino al ${summary.through}`);
  }
  if (summary.extras.length > 0) {
    const extra = formatNumberRuns(summary.extras);
    parts.push(parts.length ? `+ ${extra}` : extra);
  }
  return parts.join(" ");
}
