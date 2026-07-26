import { getFirebaseDb, isFirebaseConfigured } from "@/lib/firebase";
import { PINS, createId } from "@/lib/constants";
import { onValue, ref, set } from "firebase/database";

export const APP_SETTINGS_PATH = "appSettings";
export const APP_SETTINGS_STORAGE_KEY = "fdb-app-settings";

export interface AppPins {
  staff: string;
  admin: string;
  orderSetup: string;
  orderDisplay: string;
  orderKeypad: string;
}

export interface OrderColorRange {
  id: string;
  from: number;
  to: number;
  color: string;
}

export interface AppSettings {
  pins: AppPins;
  /** Secondi di cerchio highlight sullo schermo ordini */
  orderHighlightSeconds: number;
  /** Colore cerchio highlight (hex) */
  orderHighlightColor: string;
  /** Scala dimensione numeri ordine (0.6–2.2) */
  orderNumberScale: number;
  /** Colori numeri per fasce (es. 1–19 blu) */
  orderColorRanges: OrderColorRange[];
  /** Posti oltre capacità senza chiedere override */
  capacityOverflow: number;
  /** Cifre max numero ordine (tastierino) */
  orderMaxDigits: number;
  updatedAt: number;
}

export const DEFAULT_COLOR_RANGES: OrderColorRange[] = [
  { id: "r1", from: 1, to: 19, color: "#2563eb" },
  { id: "r2", from: 20, to: 39, color: "#dc2626" },
  { id: "r3", from: 40, to: 59, color: "#2d5a27" },
  { id: "r4", from: 60, to: 79, color: "#d97706" },
  { id: "r5", from: 80, to: 999, color: "#7c3aed" },
];

export const DEFAULT_SETTINGS: AppSettings = {
  pins: {
    staff: PINS.staff,
    admin: PINS.admin,
    orderSetup: PINS.orderSetup,
    orderDisplay: PINS.orderDisplay,
    orderKeypad: PINS.orderKeypad,
  },
  orderHighlightSeconds: 8,
  orderHighlightColor: "#dc2626",
  orderNumberScale: 1,
  orderColorRanges: DEFAULT_COLOR_RANGES.map((r) => ({ ...r })),
  capacityOverflow: 2,
  orderMaxDigits: 4,
  updatedAt: 0,
};

type Listener = (settings: AppSettings) => void;

const listeners = new Set<Listener>();
let cached: AppSettings = cloneSettings(DEFAULT_SETTINGS);

function cloneSettings(s: AppSettings): AppSettings {
  return {
    ...s,
    pins: { ...s.pins },
    orderColorRanges: s.orderColorRanges.map((r) => ({ ...r })),
  };
}

export function getAppSettings(): AppSettings {
  return cached;
}

function notify(settings: AppSettings) {
  cached = settings;
  listeners.forEach((l) => l(settings));
}

function clampInt(n: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function clampFloat(n: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
}

function normalizePin(value: unknown, fallback: string) {
  const s = String(value ?? "").trim().toUpperCase();
  return s.length >= 4 ? s : fallback;
}

function normalizeHex(value: unknown, fallback: string) {
  if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) {
    return value.toLowerCase();
  }
  return fallback;
}

function normalizeRanges(raw: unknown): OrderColorRange[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_COLOR_RANGES.map((r) => ({ ...r }));
  }
  const out: OrderColorRange[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Partial<OrderColorRange>;
    const from = clampInt(Number(r.from), 1, 9999, 1);
    const to = clampInt(Number(r.to), from, 9999, from);
    out.push({
      id: String(r.id || createId()),
      from,
      to,
      color: normalizeHex(r.color, "#2563eb"),
    });
  }
  return out.length ? out : DEFAULT_COLOR_RANGES.map((r) => ({ ...r }));
}

export function colorForOrderNumber(
  n: number,
  ranges: OrderColorRange[],
  fallback = "#142418",
): string {
  for (const r of ranges) {
    if (n >= r.from && n <= r.to) return r.color;
  }
  return fallback;
}

export function normalizeSettings(raw: Partial<AppSettings> | null): AppSettings {
  const pinsRaw = raw?.pins ?? {};
  return {
    pins: {
      staff: normalizePin((pinsRaw as AppPins).staff, DEFAULT_SETTINGS.pins.staff),
      admin: normalizePin((pinsRaw as AppPins).admin, DEFAULT_SETTINGS.pins.admin),
      orderSetup: normalizePin(
        (pinsRaw as AppPins).orderSetup,
        DEFAULT_SETTINGS.pins.orderSetup,
      ),
      orderDisplay: normalizePin(
        (pinsRaw as AppPins).orderDisplay,
        DEFAULT_SETTINGS.pins.orderDisplay,
      ),
      orderKeypad: normalizePin(
        (pinsRaw as AppPins).orderKeypad,
        DEFAULT_SETTINGS.pins.orderKeypad,
      ),
    },
    orderHighlightSeconds: clampInt(
      Number(raw?.orderHighlightSeconds),
      3,
      60,
      DEFAULT_SETTINGS.orderHighlightSeconds,
    ),
    orderHighlightColor: normalizeHex(
      raw?.orderHighlightColor,
      DEFAULT_SETTINGS.orderHighlightColor,
    ),
    orderNumberScale: clampFloat(
      Number(raw?.orderNumberScale),
      0.6,
      2.2,
      DEFAULT_SETTINGS.orderNumberScale,
    ),
    orderColorRanges: normalizeRanges(raw?.orderColorRanges),
    capacityOverflow: clampInt(
      Number(raw?.capacityOverflow),
      0,
      20,
      DEFAULT_SETTINGS.capacityOverflow,
    ),
    orderMaxDigits: clampInt(
      Number(raw?.orderMaxDigits),
      2,
      6,
      DEFAULT_SETTINGS.orderMaxDigits,
    ),
    updatedAt: Number(raw?.updatedAt) || Date.now(),
  };
}

function readDemo(): AppSettings {
  if (typeof window === "undefined") return cloneSettings(DEFAULT_SETTINGS);
  try {
    const raw = localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
    if (!raw) return cloneSettings(DEFAULT_SETTINGS);
    return normalizeSettings(JSON.parse(raw) as Partial<AppSettings>);
  } catch {
    return cloneSettings(DEFAULT_SETTINGS);
  }
}

function writeDemo(settings: AppSettings) {
  localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  notify(settings);
}

function dataMode(): "firebase" | "demo" {
  return isFirebaseConfigured() ? "firebase" : "demo";
}

export function subscribeAppSettings(listener: Listener): () => void {
  if (dataMode() === "demo") {
    listeners.add(listener);
    const s = readDemo();
    notify(s);
    listener(s);
    return () => listeners.delete(listener);
  }

  const db = getFirebaseDb();
  if (!db) {
    listeners.add(listener);
    listener(cached);
    return () => listeners.delete(listener);
  }

  listeners.add(listener);
  const unsub = onValue(
    ref(db, APP_SETTINGS_PATH),
    (snap) => {
      const next = snap.exists()
        ? normalizeSettings(snap.val() as Partial<AppSettings>)
        : cloneSettings({ ...DEFAULT_SETTINGS, updatedAt: Date.now() });
      notify(next);
      listener(next);
    },
    () => listener(cached),
  );

  return () => {
    listeners.delete(listener);
    unsub();
  };
}

export async function saveAppSettings(partial: Partial<AppSettings>) {
  const next = normalizeSettings({
    ...cached,
    ...partial,
    pins: { ...cached.pins, ...(partial.pins ?? {}) },
    orderColorRanges: partial.orderColorRanges ?? cached.orderColorRanges,
    updatedAt: Date.now(),
  });

  if (dataMode() === "demo") {
    writeDemo(next);
    return next;
  }

  const db = getFirebaseDb();
  if (!db) throw new Error("Firebase non configurato");
  await set(ref(db, APP_SETTINGS_PATH), next);
  notify(next);
  return next;
}

export async function resetAppSettings() {
  return saveAppSettings(cloneSettings({ ...DEFAULT_SETTINGS, updatedAt: Date.now() }));
}

export const HIGHLIGHT_COLOR_PRESETS = [
  { id: "red", hex: "#dc2626", label: "Rosso" },
  { id: "amber", hex: "#d97706", label: "Ambra" },
  { id: "forest", hex: "#2d5a27", label: "Verde" },
  { id: "blue", hex: "#2563eb", label: "Blu" },
  { id: "purple", hex: "#7c3aed", label: "Viola" },
  { id: "pink", hex: "#db2777", label: "Rosa" },
] as const;
