export type UserRole = "staff" | "admin";

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

export interface ZoneLayout {
  id: string;
  name: Zone;
  tables: TableSpot[];
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
