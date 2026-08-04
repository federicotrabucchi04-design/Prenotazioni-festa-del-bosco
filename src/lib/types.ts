export type UserRole =
  | "staff"
  | "admin"
  | "orderSetup"
  | "orderDisplay"
  | "orderKeypad"
  | "orderBuoni"
  | "computer";

/** Nome zona dinamico (configurabile dall'admin) */
export type Zone = string;

export interface TableSpot {
  id: string;
  /** Numero mostrato sullo schermo (es. 1, 2, 3…) */
  number: number;
  /** Posizione in % sulla griglia (0–100) */
  x: number;
  y: number;
  /** Posti massimi del tavolo */
  capacity: number;
}

/** Riferimenti grafici (non interattivi come i tavoli) */
export type MapMarkKind = "line" | "rect" | "text";

export interface MapMark {
  id: string;
  kind: MapMarkKind;
  /** Linea: punto A; Rettangolo: angolo alto-sx; Testo: ancoraggio */
  x: number;
  y: number;
  /** Linea: punto B */
  x2?: number;
  y2?: number;
  /** Rettangolo: larghezza/altezza in % */
  w?: number;
  h?: number;
  /** Testo etichetta */
  text?: string;
  /** Dimensione testo in unità viewBox (default ~3.2) */
  fontSize?: number;
  /** Colore opzionale (hex), default tema bosco */
  color?: string;
}

export interface ZoneLayout {
  id: string;
  name: Zone;
  tables: TableSpot[];
  /** Linee, rettangoli e scritte di riferimento */
  marks: MapMark[];
  /** Colore zona in cartina (hex), default verde bosco */
  color?: string;
}

export interface VenueLayout {
  zones: ZoneLayout[];
  updatedAt: number;
}

export interface Reservation {
  id: string;
  name: string;
  phone: string;
  adults: number;
  children: number;
  total: number;
  notes: string;
  zone: Zone;
  /** 0 = tavolo non ancora assegnato */
  tableNumber: number;
  arrived: boolean;
  date: string;
  updatedAt?: number;
}

export type ReservationInput = Omit<Reservation, "id" | "total" | "updatedAt"> & {
  id?: string;
  /** Se true, salva anche oltre capacità+2 */
  allowOverCapacity?: boolean;
};

export type AppView = "list" | "map" | "zones";

export type EveningStatus = "active" | "archived";

export interface Evening {
  id: string;
  label: string;
  status: EveningStatus;
  createdAt: number;
}

/** Riepilogo leggero dopo archivio — senza dettagli prenotazioni */
export interface ArchiveSummary {
  eveningId: string;
  eveningLabel: string;
  archivedAt: number;
  /** Somma delle persone prenotate (campo total) */
  totalPeopleBooked: number;
  reservationCount: number;
  /** Somma persone di prenotazioni segnate come arrivate */
  arrivedPeopleCount: number;
}

export interface CapacityCheck {
  ok: boolean;
  capacity: number;
  softLimit: number;
  currentOthers: number;
  incoming: number;
  proposedTotal: number;
  overBy: number;
  guests: string[];
}
