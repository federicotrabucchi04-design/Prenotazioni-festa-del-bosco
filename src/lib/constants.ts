import type { Reservation, Zone } from "@/lib/types";

export const ZONES: Zone[] = [
  "Tenda 1",
  "Tenda 2",
  "Tenda 3",
  "Tenda 4",
  "Balera",
  "Centro Bar",
  "Campo da Calcio",
];

export const EVENT_DATE = "8 Agosto";

export const PINS = {
  staff: "STAFF2026",
  admin: "BOSCOADMIN",
  /** Assegna numeri d’ordine ai tavoli */
  orderSetup: "ORDINE2026",
  /** Schermo cartina a tutto schermo */
  orderDisplay: "SCHERMO2026",
  /** Tastierino numerico */
  orderKeypad: "TASTO2026",
} as const;

export const AUTH_STORAGE_KEY = "fdb-auth-role";
/** @deprecated migrato in DEMO_EVENINGS_STORAGE_KEY */
export const DEMO_STORAGE_KEY = "fdb-demo-reservations";
export const DEMO_EVENINGS_STORAGE_KEY = "fdb-demo-evenings";

export const SEED_RESERVATIONS: Omit<Reservation, "id">[] = [
  {
    name: "Mario Rossi",
    phone: "3331234567",
    adults: 4,
    children: 2,
    total: 6,
    notes: "Senza glutine per 1 persona",
    zone: "Tenda 1",
    tableNumber: 3,
    arrived: false,
    date: EVENT_DATE,
  },
  {
    name: "Laura Bianchi",
    phone: "3409876543",
    adults: 2,
    children: 0,
    total: 2,
    notes: "",
    zone: "Tenda 2",
    tableNumber: 1,
    arrived: true,
    date: EVENT_DATE,
  },
  {
    name: "Famiglia Verdi",
    phone: "3471122334",
    adults: 5,
    children: 3,
    total: 8,
    notes: "Passeggini: 1",
    zone: "Balera",
    tableNumber: 7,
    arrived: false,
    date: EVENT_DATE,
  },
  {
    name: "Andrea Neri",
    phone: "3335566778",
    adults: 3,
    children: 1,
    total: 4,
    notes: "Allergia noci",
    zone: "Centro Bar",
    tableNumber: 2,
    arrived: false,
    date: EVENT_DATE,
  },
  {
    name: "Ospite senza tavolo",
    phone: "3330000000",
    adults: 2,
    children: 1,
    total: 3,
    notes: "Esempio: usa Assegna tavolo",
    zone: "Tenda 1",
    tableNumber: 0,
    arrived: false,
    date: EVENT_DATE,
  },
];

export function calcTotal(adults: number, children: number) {
  return Math.max(0, adults) + Math.max(0, children);
}

export function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `r_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
