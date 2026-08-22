import { getFirebaseDb, isFirebaseConfigured } from "@/lib/firebase";
import {
  type CartinaPrefs,
  type CartinaExtraTable,
  type ZoneOnBoard,
  normalizePlacement,
  normalizeExtraTable,
} from "@/lib/cartina";
import type { MapMark } from "@/lib/types";
import {
  offlineSet,
  offlineUpdate,
  hasPendingWriteForPath,
} from "@/lib/offline-sync";
import { get, onValue, ref, runTransaction } from "firebase/database";

export const ORDER_BOARD_STORAGE_KEY = "fdb-order-board";
export const ORDER_BOARD_PATH = "orderBoard";
/** Marker: cache inizializzata da remoto */
const ORDER_BOARD_SEEDED_KEY = "fdb-order-board-seeded";

export type OrderAssignments = Record<string, number[]>;

export interface OrderHighlight {
  orderNumber: number;
  found: boolean;
  at: number;
}

export interface OrderBoardState {
  /** chiave: `${zoneId}_${tableNumber}` → uno o più numeri ordine */
  assignments: OrderAssignments;
  highlight: OrderHighlight | null;
  /** Disposizione cartina condivisa tra i terminali */
  cartina: CartinaPrefs | null;
  updatedAt: number;
}

type Listener = (state: OrderBoardState) => void;

const listeners = new Set<Listener>();

function emptyBoard(): OrderBoardState {
  return {
    assignments: {},
    highlight: null,
    cartina: null,
    updatedAt: 0,
  };
}

export function assignmentKey(zoneId: string, tableNumber: number) {
  return `${zoneId}_${tableNumber}`;
}

export function parseAssignmentKey(key: string): {
  zoneId: string;
  tableNumber: number;
} | null {
  const idx = key.lastIndexOf("_");
  if (idx <= 0) return null;
  const zoneId = key.slice(0, idx);
  const tableNumber = Number(key.slice(idx + 1));
  if (!zoneId || !Number.isFinite(tableNumber)) return null;
  return { zoneId, tableNumber };
}

/** Compat: vecchio formato singolo numero → array */
export function normalizeOrderList(raw: unknown): number[] {
  if (raw == null) return [];
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw > 0 ? [Math.floor(raw)] : [];
  }
  if (Array.isArray(raw)) {
    const out: number[] = [];
    for (const v of raw) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) {
        const f = Math.floor(n);
        if (!out.includes(f)) out.push(f);
      }
    }
    return out;
  }
  if (typeof raw === "object") {
    const out: number[] = [];
    for (const v of Object.values(raw as Record<string, unknown>)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) {
        const f = Math.floor(n);
        if (!out.includes(f)) out.push(f);
      }
    }
    return out;
  }
  return [];
}

export function ordersForTable(
  assignments: OrderAssignments,
  zoneId: string,
  tableNumber: number,
): number[] {
  return assignments[assignmentKey(zoneId, tableNumber)] ?? [];
}

export function assignmentHasOrder(
  assignments: OrderAssignments,
  orderNumber: number,
): boolean {
  const n = Math.floor(orderNumber);
  for (const list of Object.values(assignments)) {
    if (list.includes(n)) return true;
  }
  return false;
}

function normalizeCartina(raw: unknown): CartinaPrefs | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Partial<CartinaPrefs>;
  if (!Array.isArray(c.placements)) return null;
  const placements: ZoneOnBoard[] = c.placements
    .filter((p) => p && typeof p.zoneId === "string")
    .map((p) =>
      normalizePlacement({
        zoneId: String(p.zoneId),
        x: Number(p.x) || 0,
        y: Number(p.y) || 0,
        w: Math.max(8, Number(p.w) || 30),
        h: Math.max(8, Number(p.h) || 28),
        tableGapX: p.tableGapX,
        tableGapY: p.tableGapY,
        hideTitle: p.hideTitle === true ? true : undefined,
        rotation: p.rotation,
        mirror: p.mirror === true ? true : undefined,
        center: p.center === true ? true : undefined,
      }),
    );
  const marks: MapMark[] = Array.isArray(c.marks)
    ? (c.marks as MapMark[]).filter((m) => m && m.kind)
    : [];
  const extraTables = Array.isArray(c.extraTables)
    ? (c.extraTables as Partial<CartinaExtraTable>[])
        .map((t, i) => normalizeExtraTable(t, i))
        .filter((t): t is CartinaExtraTable => Boolean(t))
    : [];
  const out: CartinaPrefs = { placements, marks };
  if (extraTables.length) out.extraTables = extraTables;
  if (c.mirrorOrdini === true) out.mirrorOrdini = true;
  if (c.mirrorSchermo === true) out.mirrorSchermo = true;
  if (c.centerOrdini === true) out.centerOrdini = true;
  if (c.centerSchermo === true) out.centerSchermo = true;
  if (
    c.mirrored === true &&
    c.mirrorOrdini == null &&
    c.mirrorSchermo == null
  ) {
    out.mirrored = true;
  }
  return out;
}

function normalizeBoard(raw: Partial<OrderBoardState> | null): OrderBoardState {
  if (!raw) return emptyBoard();
  const assignments: OrderAssignments = {};
  if (raw.assignments && typeof raw.assignments === "object") {
    for (const [k, v] of Object.entries(raw.assignments)) {
      const list = normalizeOrderList(v);
      if (list.length > 0) assignments[k] = list;
    }
  }
  let highlight: OrderHighlight | null = null;
  if (raw.highlight && typeof raw.highlight === "object") {
    const h = raw.highlight as Partial<OrderHighlight>;
    const n = Number(h.orderNumber);
    if (Number.isFinite(n) && n > 0) {
      highlight = {
        orderNumber: Math.floor(n),
        found: Boolean(h.found),
        at: Number(h.at) || Date.now(),
      };
    }
  }
  return {
    assignments,
    highlight,
    cartina: normalizeCartina(raw.cartina),
    updatedAt: Number(raw.updatedAt) || 0,
  };
}

function notify(state: OrderBoardState) {
  listeners.forEach((l) => l(state));
}

function readDemo(): OrderBoardState {
  if (typeof window === "undefined") return emptyBoard();
  try {
    const raw = localStorage.getItem(ORDER_BOARD_STORAGE_KEY);
    if (!raw) return emptyBoard();
    return normalizeBoard(JSON.parse(raw) as Partial<OrderBoardState>);
  } catch {
    return emptyBoard();
  }
}

function writeDemo(state: OrderBoardState) {
  try {
    localStorage.setItem(ORDER_BOARD_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota: continua (UI + Firebase)
  }
  notify(state);
}

function markSeededFromRemote() {
  try {
    localStorage.setItem(ORDER_BOARD_SEEDED_KEY, "1");
  } catch {
    // ignore
  }
}

function wasSeededFromRemote() {
  try {
    return localStorage.getItem(ORDER_BOARD_SEEDED_KEY) === "1";
  } catch {
    return false;
  }
}

function dataMode(): "firebase" | "demo" {
  return isFirebaseConfigured() ? "firebase" : "demo";
}

export function subscribeOrderBoard(listener: Listener): () => void {
  listeners.add(listener);

  if (dataMode() === "demo") {
    listener(readDemo());
    return () => listeners.delete(listener);
  }

  const db = getFirebaseDb();
  if (!db) {
    listener(readDemo());
    return () => listeners.delete(listener);
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    listener(readDemo());
  }

  const unsub = onValue(
    ref(db, ORDER_BOARD_PATH),
    (snap) => {
      if (!snap.exists()) {
        if (hasPendingWriteForPath(ORDER_BOARD_PATH)) {
          listener(readDemo());
          return;
        }
        if (
          !wasSeededFromRemote() &&
          Object.keys(readDemo().assignments).length > 0
        ) {
          listener(readDemo());
          return;
        }
        const empty = emptyBoard();
        writeDemo(empty);
        markSeededFromRemote();
        listener(empty);
        return;
      }
      const state = normalizeBoard(snap.val() as Partial<OrderBoardState>);
      markSeededFromRemote();
      if (hasPendingWriteForPath(ORDER_BOARD_PATH)) {
        const local = readDemo();
        if (local.updatedAt >= state.updatedAt) {
          listener(local);
          return;
        }
      }
      writeDemo(state);
      listener(state);
    },
    () => listener(readDemo()),
  );

  return () => {
    listeners.delete(listener);
    unsub();
  };
}

async function persistFull(state: OrderBoardState) {
  const next = { ...state, updatedAt: Date.now() };
  writeDemo(next);
  if (dataMode() === "demo") return next;
  await offlineSet(ORDER_BOARD_PATH, next);
  return next;
}

/**
 * Scrive solo le foglie assignments toccate (multipath).
 * Due tablet non si cancellano più cartina / altri tavoli.
 */
export async function setTableOrderNumbers(
  zoneId: string,
  tableNumber: number,
  orderNumbers: number[],
) {
  const key = assignmentKey(zoneId, tableNumber);
  const current = await loadBoardForWrite();
  const assignments: OrderAssignments = { ...current.assignments };
  const cleaned = normalizeOrderList(orderNumbers);
  const patch: Record<string, unknown> = {};

  for (const n of cleaned) {
    for (const [k, list] of Object.entries(assignments)) {
      if (k === key) continue;
      if (!list.includes(n)) continue;
      const filtered = list.filter((x) => x !== n);
      if (filtered.length === 0) {
        delete assignments[k];
        patch[`assignments/${k}`] = null;
      } else {
        assignments[k] = filtered;
        patch[`assignments/${k}`] = filtered;
      }
    }
  }

  if (cleaned.length === 0) {
    delete assignments[key];
    patch[`assignments/${key}`] = null;
  } else {
    assignments[key] = cleaned;
    patch[`assignments/${key}`] = cleaned;
  }

  const updatedAt = Date.now();
  patch.updatedAt = updatedAt;
  const next: OrderBoardState = { ...current, assignments, updatedAt };
  writeDemo(next);

  if (dataMode() === "demo") return next;
  await offlineUpdate(ORDER_BOARD_PATH, patch);
  return next;
}

export async function setTableOrderNumber(
  zoneId: string,
  tableNumber: number,
  orderNumber: number | null,
) {
  if (orderNumber == null || orderNumber <= 0) {
    return setTableOrderNumbers(zoneId, tableNumber, []);
  }
  const current = await loadBoardForWrite();
  const key = assignmentKey(zoneId, tableNumber);
  const existing = current.assignments[key] ?? [];
  const n = Math.floor(orderNumber);
  if (existing.includes(n)) {
    return setTableOrderNumbers(zoneId, tableNumber, existing);
  }
  return setTableOrderNumbers(zoneId, tableNumber, [...existing, n]);
}

export async function setOrderHighlight(orderNumber: number | null) {
  const board = await loadBoardForWrite();
  const highlight =
    orderNumber == null || orderNumber <= 0
      ? null
      : {
          orderNumber: Math.floor(orderNumber),
          found: assignmentHasOrder(board.assignments, Math.floor(orderNumber)),
          at: Date.now(),
        };

  const next = { ...board, highlight, updatedAt: Date.now() };
  writeDemo(next);
  if (dataMode() === "demo") return next;
  await offlineUpdate(ORDER_BOARD_PATH, {
    highlight,
    updatedAt: next.updatedAt,
  });
  return next;
}

export async function clearOrderHighlight() {
  return setOrderHighlight(null);
}

/** Pulisce highlight solo se è ancora quello con `at` (transaction anti-race). */
export async function clearOrderHighlightIf(at: number) {
  const local = readDemo();
  if (!local.highlight || local.highlight.at !== at) return local;

  if (dataMode() === "demo") {
    const next = { ...local, highlight: null, updatedAt: Date.now() };
    writeDemo(next);
    return next;
  }

  const db = getFirebaseDb();
  if (!db || (typeof navigator !== "undefined" && !navigator.onLine)) {
    const next = { ...local, highlight: null, updatedAt: Date.now() };
    writeDemo(next);
    await offlineUpdate(ORDER_BOARD_PATH, {
      highlight: null,
      updatedAt: next.updatedAt,
    });
    return next;
  }

  try {
    await runTransaction(ref(db, `${ORDER_BOARD_PATH}/highlight`), (cur) => {
      if (!cur || typeof cur !== "object") return cur;
      const h = cur as Partial<OrderHighlight>;
      if (Number(h.at) !== at) return; // abort
      return null;
    });
    const updatedAt = Date.now();
    await offlineUpdate(ORDER_BOARD_PATH, { updatedAt });
    const next = { ...readDemo(), highlight: null, updatedAt };
    writeDemo(next);
    return next;
  } catch {
    const again = readDemo();
    if (!again.highlight || again.highlight.at !== at) return again;
    const next = { ...again, highlight: null, updatedAt: Date.now() };
    writeDemo(next);
    await offlineUpdate(ORDER_BOARD_PATH, {
      highlight: null,
      updatedAt: next.updatedAt,
    });
    return next;
  }
}

export async function saveOrderCartina(cartina: CartinaPrefs) {
  const current = await loadBoardForWrite();
  const next = { ...current, cartina, updatedAt: Date.now() };
  writeDemo(next);
  if (dataMode() === "demo") return next;
  await offlineUpdate(ORDER_BOARD_PATH, {
    cartina,
    updatedAt: next.updatedAt,
  });
  return next;
}

export async function clearAllAssignments() {
  const current = await loadBoardForWrite();
  const next: OrderBoardState = {
    ...current,
    assignments: {},
    highlight: null,
    updatedAt: Date.now(),
  };
  writeDemo(next);
  if (dataMode() === "demo") return next;
  await offlineUpdate(ORDER_BOARD_PATH, {
    assignments: null,
    highlight: null,
    updatedAt: next.updatedAt,
  });
  return next;
}

/** Rimuove dai tavoli tutti i numeri d’ordine ≤ maxInclusive. */
export async function clearAssignmentsUpTo(maxInclusive: number) {
  const max = Math.floor(Number(maxInclusive));
  if (!Number.isFinite(max) || max <= 0) {
    throw new Error("Indica un numero valido");
  }
  const current = await loadBoardForWrite();
  const assignments: OrderAssignments = { ...current.assignments };
  const patch: Record<string, unknown> = {};
  let removed = 0;

  for (const [k, list] of Object.entries(assignments)) {
    const kept = list.filter((n) => n > max);
    removed += list.length - kept.length;
    if (kept.length === list.length) continue;
    if (kept.length === 0) {
      delete assignments[k];
      patch[`assignments/${k}`] = null;
    } else {
      assignments[k] = kept;
      patch[`assignments/${k}`] = kept;
    }
  }

  if (removed === 0) {
    return { ...current, removed: 0 };
  }

  const updatedAt = Date.now();
  patch.updatedAt = updatedAt;
  if (current.highlight && current.highlight.orderNumber <= max) {
    patch.highlight = null;
  }
  const next: OrderBoardState = {
    ...current,
    assignments,
    highlight:
      current.highlight && current.highlight.orderNumber <= max
        ? null
        : current.highlight,
    updatedAt,
  };
  writeDemo(next);
  if (dataMode() === "demo") return { ...next, removed };
  await offlineUpdate(ORDER_BOARD_PATH, patch);
  return { ...next, removed };
}

async function fetchBoardOnce(): Promise<OrderBoardState> {
  const db = getFirebaseDb();
  if (!db) return readDemo();
  try {
    const snap = await get(ref(db, ORDER_BOARD_PATH));
    if (!snap.exists()) return readDemo();
    return normalizeBoard(snap.val() as Partial<OrderBoardState>);
  } catch {
    return readDemo();
  }
}

async function loadBoardForWrite(): Promise<OrderBoardState> {
  const local = readDemo();
  if (dataMode() === "demo") return local;
  if (typeof navigator !== "undefined" && !navigator.onLine) return local;
  if (hasPendingWriteForPath(ORDER_BOARD_PATH)) return local;
  try {
    const remote = await fetchBoardOnce();
    return remote.updatedAt >= local.updatedAt ? remote : local;
  } catch {
    return local;
  }
}

export function findTablesByOrder(
  assignments: OrderAssignments,
  orderNumber: number,
): { zoneId: string; tableNumber: number }[] {
  const out: { zoneId: string; tableNumber: number }[] = [];
  const n = Math.floor(orderNumber);
  for (const [k, list] of Object.entries(assignments)) {
    if (!list.includes(n)) continue;
    const parsed = parseAssignmentKey(k);
    if (parsed) out.push(parsed);
  }
  return out;
}

export async function patchOrderBoard(partial: Partial<OrderBoardState>) {
  const current = await loadBoardForWrite();
  const next = normalizeBoard({
    ...current,
    ...partial,
    updatedAt: Date.now(),
  });
  writeDemo(next);
  if (dataMode() === "demo") return next;
  await offlineUpdate(ORDER_BOARD_PATH, {
    ...partial,
    updatedAt: next.updatedAt,
  });
  return next;
}

export function getCachedOrderBoard(): OrderBoardState {
  return readDemo();
}

export async function restoreOrderBoardState(state: OrderBoardState) {
  return persistFull(normalizeBoard(state));
}
