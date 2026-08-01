import { getFirebaseDb, isFirebaseConfigured } from "@/lib/firebase";
import {
  type CartinaPrefs,
  type ZoneOnBoard,
  normalizePlacement,
} from "@/lib/cartina";
import type { MapMark } from "@/lib/types";
import { get, onValue, ref, set, update } from "firebase/database";

export const ORDER_BOARD_STORAGE_KEY = "fdb-order-board";
export const ORDER_BOARD_PATH = "orderBoard";

export type OrderAssignments = Record<string, number>;

export interface OrderHighlight {
  orderNumber: number;
  found: boolean;
  at: number;
}

export interface OrderBoardState {
  /** chiave: `${zoneId}_${tableNumber}` → numero ordine */
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
    updatedAt: Date.now(),
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
      }),
    );
  const marks: MapMark[] = Array.isArray(c.marks)
    ? (c.marks as MapMark[]).filter((m) => m && m.kind)
    : [];
  return { placements, marks };
}

function normalizeBoard(raw: Partial<OrderBoardState> | null): OrderBoardState {
  if (!raw) return emptyBoard();
  const assignments: OrderAssignments = {};
  if (raw.assignments && typeof raw.assignments === "object") {
    for (const [k, v] of Object.entries(raw.assignments)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) assignments[k] = Math.floor(n);
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
    updatedAt: Number(raw.updatedAt) || Date.now(),
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
  localStorage.setItem(ORDER_BOARD_STORAGE_KEY, JSON.stringify(state));
  notify(state);
}

function dataMode(): "firebase" | "demo" {
  return isFirebaseConfigured() ? "firebase" : "demo";
}

export function subscribeOrderBoard(listener: Listener): () => void {
  if (dataMode() === "demo") {
    listeners.add(listener);
    listener(readDemo());
    return () => listeners.delete(listener);
  }

  const db = getFirebaseDb();
  if (!db) {
    listeners.add(listener);
    listener(emptyBoard());
    return () => listeners.delete(listener);
  }

  return onValue(
    ref(db, ORDER_BOARD_PATH),
    (snap) => {
      listener(
        snap.exists()
          ? normalizeBoard(snap.val() as Partial<OrderBoardState>)
          : emptyBoard(),
      );
    },
    () => listener(emptyBoard()),
  );
}

async function persist(state: OrderBoardState) {
  const next = { ...state, updatedAt: Date.now() };
  if (dataMode() === "demo") {
    writeDemo(next);
    return next;
  }
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase non configurato");
  await set(ref(db, ORDER_BOARD_PATH), next);
  return next;
}

export async function setTableOrderNumber(
  zoneId: string,
  tableNumber: number,
  orderNumber: number | null,
) {
  const key = assignmentKey(zoneId, tableNumber);
  const current = dataMode() === "demo" ? readDemo() : await fetchBoardOnce();
  const assignments = { ...current.assignments };
  if (orderNumber == null || orderNumber <= 0) {
    delete assignments[key];
  } else {
    // Un numero ordine = un solo tavolo
    for (const [k, v] of Object.entries(assignments)) {
      if (v === orderNumber && k !== key) delete assignments[k];
    }
    assignments[key] = Math.floor(orderNumber);
  }
  return persist({ ...current, assignments });
}

export async function setOrderHighlight(orderNumber: number | null) {
  const current = dataMode() === "demo" ? readDemo() : await fetchBoardOnce();
  const highlight =
    orderNumber == null || orderNumber <= 0
      ? null
      : {
          orderNumber: Math.floor(orderNumber),
          found: Object.values(current.assignments).includes(
            Math.floor(orderNumber),
          ),
          at: Date.now(),
        };

  if (dataMode() === "demo") {
    return persist({ ...current, highlight });
  }

  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase non configurato");
  await update(ref(db, ORDER_BOARD_PATH), {
    highlight,
    updatedAt: Date.now(),
  });
  return fetchBoardOnce();
}

export async function clearOrderHighlight() {
  return setOrderHighlight(null);
}

/** Pulisce lo highlight solo se è ancora quello partito a `at` (evita race tra device) */
export async function clearOrderHighlightIf(at: number) {
  const current = dataMode() === "demo" ? readDemo() : await fetchBoardOnce();
  if (!current.highlight || current.highlight.at !== at) return current;
  return clearOrderHighlight();
}

export async function saveOrderCartina(cartina: CartinaPrefs) {
  if (dataMode() === "demo") {
    const current = readDemo();
    return persist({ ...current, cartina });
  }
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase non configurato");
  await update(ref(db, ORDER_BOARD_PATH), {
    cartina,
    updatedAt: Date.now(),
  });
  return fetchBoardOnce();
}

export async function clearAllAssignments() {
  const current = dataMode() === "demo" ? readDemo() : await fetchBoardOnce();
  return persist({ ...current, assignments: {}, highlight: null });
}

async function fetchBoardOnce(): Promise<OrderBoardState> {
  const db = getFirebaseDb();
  if (!db) return emptyBoard();
  const snap = await get(ref(db, ORDER_BOARD_PATH));
  if (!snap.exists()) return emptyBoard();
  return normalizeBoard(snap.val() as Partial<OrderBoardState>);
}

/** Trova tavolo/i con un certo numero ordine */
export function findTablesByOrder(
  assignments: OrderAssignments,
  orderNumber: number,
): { zoneId: string; tableNumber: number }[] {
  const out: { zoneId: string; tableNumber: number }[] = [];
  for (const [k, v] of Object.entries(assignments)) {
    if (v !== orderNumber) continue;
    const parsed = parseAssignmentKey(k);
    if (parsed) out.push(parsed);
  }
  return out;
}

export async function patchOrderBoard(partial: Partial<OrderBoardState>) {
  if (dataMode() === "demo") {
    const next = normalizeBoard({ ...readDemo(), ...partial });
    writeDemo(next);
    return next;
  }
  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase non configurato");
  await update(ref(db, ORDER_BOARD_PATH), {
    ...partial,
    updatedAt: Date.now(),
  });
  return fetchBoardOnce();
}
