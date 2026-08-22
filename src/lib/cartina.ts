import type { MapMark, Reservation, TableSpot, VenueLayout, ZoneLayout } from "@/lib/types";
import { createId } from "@/lib/constants";
import { clampCartinaCoord, snapGrid, CARTINA_GRID_SNAP } from "@/lib/layout-utils";

export const CARTINA_PREFS_KEY = "fdb-cartina-prefs-v3";

/** Vicini = gap attuale; lontani = doppio */
export type TableGapMode = "near" | "far";

export type ZoneRotation = 0 | 90 | 180 | 270;

/** Zona posizionata sulla lavagna (coordinate % 0–100) */
export interface ZoneOnBoard {
  zoneId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Spaziatura orizzontale tra tavoli in cartina */
  tableGapX?: TableGapMode;
  /** Spaziatura verticale tra tavoli in cartina */
  tableGapY?: TableGapMode;
  /** Se true: niente fascia titolo, solo bordo zona */
  hideTitle?: boolean;
  /** Se true: niente rettangolo di confine attorno alla zona */
  hideBorder?: boolean;
  /** Se true: scritte e titolo ruotano/specchiano con la zona (non restano dritti) */
  rotateText?: boolean;
  /** Rotazione contenuto zona (gradi) */
  rotation?: ZoneRotation;
  /** Specchio orizzontale contenuto zona (↔) */
  mirror?: boolean;
  /** Simmetria rispetto al centro contenuto zona (180°) */
  center?: boolean;
}

export interface CartinaPrefs {
  placements: ZoneOnBoard[];
  marks: MapMark[];
  /**
   * Tavoli occasionali liberi sulla lavagna A4 (anche fuori dalle zone).
   * Coordinate % rispetto all’intero foglio.
   */
  extraTables?: CartinaExtraTable[];
  /**
   * @deprecated usa mirrorOrdini / mirrorSchermo
   * Se i nuovi flag mancano, vale per entrambi.
   */
  mirrored?: boolean;
  /** Specchio solo vista Ordini (asse verticale / sinistra-destra) */
  mirrorOrdini?: boolean;
  /** Specchio solo vista Schermo (asse verticale / sinistra-destra) */
  mirrorSchermo?: boolean;
  /** Simmetria rispetto al centro — Ordini (ribaltamento 180°) */
  centerOrdini?: boolean;
  /** Simmetria rispetto al centro — Schermo (ribaltamento 180°) */
  centerSchermo?: boolean;
}

/** Tavolo extra disegnato in Ordini (fuori / sopra le zone) */
export interface CartinaExtraTable {
  id: string;
  number: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** zoneId fittizio per assegnazioni numeri sui tavoli extra */
export const EXTRA_TABLES_ZONE_ID = "__extra__";
export const EXTRA_TABLES_ZONE_NAME = "Extra";

export const CARTINA_COLORS = [
  { id: "forest", hex: "#2d5a27", label: "Verde" },
  { id: "blue", hex: "#1d4ed8", label: "Blu" },
  { id: "red", hex: "#b91c1c", label: "Rosso" },
  { id: "amber", hex: "#a16207", label: "Ambra" },
  { id: "purple", hex: "#7c3aed", label: "Viola" },
  { id: "teal", hex: "#0f766e", label: "Teal" },
  { id: "black", hex: "#142418", label: "Nero" },
] as const;

export const DEFAULT_ZONE_W = 38;
export const DEFAULT_ZONE_H = 36;
export const MIN_ZONE_SIZE = 4;
/** Gap minimo % tra zone sulla lavagna A4 */
/** Gap tra zone solo in auto-disponi / riempi (0 = bordo a bordo, disposizione libera) */
export const CARTINA_GAP = 0;
/** Margine foglio (0 = zone possono arrivare ai bordi A4) */
export const CARTINA_MARGIN = 0;

export function defaultCartinaPrefs(layout: VenueLayout): CartinaPrefs {
  return placeZonesLikeCartina(layout.zones);
}

/**
 * Dispposizione stile CARTINA.pdf (A4 verticale):
 * fascia BAR in alto, CASSA a sinistra, zone che riempiono il resto.
 */
export function defaultCartinaMarks(): MapMark[] {
  return [
    {
      id: "tpl-bar",
      kind: "rect",
      x: 0.4,
      y: 0.4,
      w: 99.2,
      h: 6.2,
      color: "#ca8a04",
    },
    {
      id: "tpl-bar-text",
      kind: "text",
      x: 50,
      y: 3.5,
      text: "BAR — BAR — BAR — BAR — BAR — BAR",
      color: "#142418",
    },
    {
      id: "tpl-cassa",
      kind: "text",
      x: 14,
      y: 11.5,
      text: "CASSA",
      color: "#1d4ed8",
    },
  ];
}

/** Packing aggressivo che riempie quasi tutto l’A4 (sotto la fascia BAR). */
export function autoPlaceZones(zones: ZoneLayout[]): ZoneOnBoard[] {
  return packZonesInBox(zones, {
    left: CARTINA_MARGIN,
    top: CARTINA_MARGIN,
    right: 100 - CARTINA_MARGIN,
    bottom: 100 - CARTINA_MARGIN,
  });
}

export function placeZonesLikeCartina(zones: ZoneLayout[]): CartinaPrefs {
  const marks = defaultCartinaMarks();
  if (zones.length === 0) return { placements: [], marks };

  const barBottom = 8.2;
  const cassaReserve = 10; // spazio sotto BAR per etichetta CASSA
  const contentTop = barBottom + cassaReserve;
  const n = zones.length;

  // Layout ispirato alla cartina cartacea: colonna sinistra + stack centrale + striscia destra
  if (n >= 4) {
    const leftW = 24;
    const rightW = 12;
    const gap = CARTINA_GAP;
    const midLeft = CARTINA_MARGIN + leftW + gap;
    const midRight = 100 - CARTINA_MARGIN - rightW - gap;

    const leftZone = zones[0]!;
    const rightZone = zones[zones.length - 1]!;
    const midZones = zones.slice(1, -1);

    if (midZones.length === 0) {
      return {
        placements: packZonesInBox(zones, {
          left: CARTINA_MARGIN,
          top: contentTop,
          right: 100 - CARTINA_MARGIN,
          bottom: 100 - CARTINA_MARGIN,
        }),
        marks,
      };
    }

    const midPack = packZonesInBox(midZones, {
      left: midLeft,
      top: barBottom,
      right: midRight,
      bottom: 100 - CARTINA_MARGIN,
      preferColumns: 1,
    });

    const placements: ZoneOnBoard[] = [
      normalizePlacement({
        zoneId: leftZone.id,
        x: CARTINA_MARGIN,
        y: contentTop,
        w: leftW,
        h: 100 - CARTINA_MARGIN - contentTop,
      }),
      ...midPack,
      normalizePlacement({
        zoneId: rightZone.id,
        x: midRight + gap,
        y: barBottom,
        w: rightW,
        h: 100 - CARTINA_MARGIN - barBottom,
      }),
    ];

    return { placements, marks };
  }

  return {
    placements: packZonesInBox(zones, {
      left: CARTINA_MARGIN,
      top: contentTop,
      right: 100 - CARTINA_MARGIN,
      bottom: 100 - CARTINA_MARGIN,
    }),
    marks,
  };
}

function packZonesInBox(
  zones: ZoneLayout[],
  box: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    preferColumns?: number;
  },
): ZoneOnBoard[] {
  const n = zones.length;
  if (n === 0) return [];
  const gap = CARTINA_GAP;
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  if (width <= 0 || height <= 0) return [];

  let cols =
    box.preferColumns ??
    Math.min(3, Math.max(1, Math.ceil(Math.sqrt(n * (width / height)))));
  // Su A4 verticale preferisci poche colonne e tante righe (come i blocchi 2×8)
  if (height > width * 1.15 && !box.preferColumns) {
    cols = Math.min(cols, n <= 3 ? 1 : 2);
  }
  const rows = Math.ceil(n / cols);
  const cellW = (width - gap * (cols - 1)) / cols;
  const cellH = (height - gap * (rows - 1)) / rows;

  return zones.map((z, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    // Ultima riga: espandi in larghezza se non riempie le colonne
    const itemsInRow =
      row === rows - 1 ? n - row * cols : cols;
    const rowCols = itemsInRow;
    const rowCellW =
      row === rows - 1 && itemsInRow < cols
        ? (width - gap * (rowCols - 1)) / rowCols
        : cellW;
    const c = row === rows - 1 && itemsInRow < cols ? i - row * cols : col;
    return normalizePlacement({
      zoneId: z.id,
      x: box.left + c * (rowCellW + gap),
      y: box.top + row * (cellH + gap),
      w: rowCellW,
      h: cellH,
    });
  });
}

/** Espande le zone già posizionate per riempire l’intero foglio (gap minimo). */
export function fillPagePlacements(placements: ZoneOnBoard[]): ZoneOnBoard[] {
  if (placements.length === 0) return [];
  const zones = placements.map((p) => ({ id: p.zoneId } as ZoneLayout));
  // Mantieni ordine attuale
  return packZonesInBox(
    zones.map((z) => ({ id: z.id, name: z.id, tables: [], marks: [] })),
    {
      left: CARTINA_MARGIN,
      top: CARTINA_MARGIN,
      right: 100 - CARTINA_MARGIN,
      bottom: 100 - CARTINA_MARGIN,
    },
  ).map((p, i) => ({
    ...p,
    zoneId: placements[i]!.zoneId,
  }));
}

function migrateFromGrid(raw: Record<string, unknown>, layout: VenueLayout): CartinaPrefs | null {
  if (!Array.isArray(raw.placements) || raw.placements.length === 0) return null;
  const first = raw.placements[0] as Record<string, unknown>;
  if (typeof first.row !== "number" || typeof first.col !== "number") return null;

  const gridRows = Math.max(1, Number(raw.gridRows) || 2);
  const gridCols = Math.max(1, Number(raw.gridCols) || 2);
  const known = new Set(layout.zones.map((z) => z.id));
  const gap = 1.5;
  const cellW = (100 - gap * (gridCols + 1)) / gridCols;
  const cellH = (100 - gap * (gridRows + 1)) / gridRows;

  const placements: ZoneOnBoard[] = [];
  for (const p of raw.placements as Record<string, unknown>[]) {
    const zoneId = String(p.zoneId ?? "");
    if (!known.has(zoneId)) continue;
    const row = Number(p.row) || 0;
    const col = Number(p.col) || 0;
    const rowSpan = Math.max(1, Number(p.rowSpan) || 1);
    const colSpan = Math.max(1, Number(p.colSpan) || 1);
    placements.push({
      zoneId,
      x: gap + col * (cellW + gap),
      y: gap + row * (cellH + gap),
      w: cellW * colSpan + gap * (colSpan - 1),
      h: cellH * rowSpan + gap * (rowSpan - 1),
    });
  }
  return { placements, marks: [] };
}

function migrateFromOrder(raw: Record<string, unknown>, layout: VenueLayout): CartinaPrefs | null {
  if (!Array.isArray(raw.zoneOrder)) return null;
  const known = new Set(layout.zones.map((z) => z.id));
  const hidden = new Set(
    Array.isArray(raw.hiddenZoneIds) ? (raw.hiddenZoneIds as string[]) : [],
  );
  const zones = layout.zones.filter(
    (z) => (raw.zoneOrder as string[]).includes(z.id) && !hidden.has(z.id),
  );
  const extras = layout.zones.filter(
    (z) => !(raw.zoneOrder as string[]).includes(z.id) && !hidden.has(z.id),
  );
  return { placements: autoPlaceZones([...zones, ...extras]), marks: [] };
}

export function loadCartinaPrefs(layout: VenueLayout): CartinaPrefs {
  const fallback = defaultCartinaPrefs(layout);
  if (typeof window === "undefined") return fallback;
  try {
    const rawStr =
      localStorage.getItem(CARTINA_PREFS_KEY) ??
      localStorage.getItem("fdb-cartina-prefs-v2") ??
      localStorage.getItem("fdb-cartina-prefs");
    if (!rawStr) return fallback;
    const parsed = JSON.parse(rawStr) as Record<string, unknown>;

    if (Array.isArray(parsed.placements) && parsed.placements[0]) {
      const sample = parsed.placements[0] as Record<string, unknown>;
      if (typeof sample.x === "number" && typeof sample.w === "number") {
        const known = new Set(layout.zones.map((z) => z.id));
        const placements = (parsed.placements as ZoneOnBoard[])
          .filter((p) => known.has(p.zoneId))
          .map(normalizePlacement)
          .filter((p, i, arr) => arr.findIndex((x) => x.zoneId === p.zoneId) === i);
        const marks = Array.isArray(parsed.marks)
          ? (parsed.marks as MapMark[]).map(normalizeCartinaMark).filter(Boolean) as MapMark[]
          : [];
        const extraTables = Array.isArray(parsed.extraTables)
          ? (parsed.extraTables as Partial<CartinaExtraTable>[])
              .map((t, i) => normalizeExtraTable(t, i))
              .filter((t): t is CartinaExtraTable => Boolean(t))
          : [];
        const prefs: CartinaPrefs = { placements, marks };
        if (extraTables.length) prefs.extraTables = extraTables;
        if (parsed.mirrorOrdini === true) prefs.mirrorOrdini = true;
        if (parsed.mirrorSchermo === true) prefs.mirrorSchermo = true;
        if (parsed.centerOrdini === true) prefs.centerOrdini = true;
        if (parsed.centerSchermo === true) prefs.centerSchermo = true;
        if (
          parsed.mirrored === true &&
          parsed.mirrorOrdini == null &&
          parsed.mirrorSchermo == null
        ) {
          prefs.mirrored = true;
        }
        saveCartinaPrefs(prefs);
        return prefs;
      }
    }

    const fromGrid = migrateFromGrid(parsed, layout);
    if (fromGrid) {
      saveCartinaPrefs(fromGrid);
      return fromGrid;
    }
    const fromOrder = migrateFromOrder(parsed, layout);
    if (fromOrder) {
      saveCartinaPrefs(fromOrder);
      return fromOrder;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export function saveCartinaPrefs(prefs: CartinaPrefs) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CARTINA_PREFS_KEY, JSON.stringify(prefs));
}

export function normalizeExtraTable(
  t: Partial<CartinaExtraTable>,
  index = 0,
): CartinaExtraTable | null {
  const id = String(t.id || "").trim();
  if (!id) return null;
  let w = Math.max(CARTINA_GRID_SNAP * 2, snapGrid(Number(t.w) || 14));
  let h = Math.max(CARTINA_GRID_SNAP * 2, snapGrid(Number(t.h) || 12));
  w = Math.min(100, w);
  h = Math.min(100, h);
  let x = snapGrid(Number(t.x) || 0);
  let y = snapGrid(Number(t.y) || 0);
  x = Math.max(0, Math.min(x, 100 - w));
  y = Math.max(0, Math.min(y, 100 - h));
  const number = Math.max(1, Math.floor(Number(t.number) || index + 1));
  return { id, number, x, y, w, h };
}

export function nextExtraTableNumber(tables: CartinaExtraTable[]) {
  const used = new Set(tables.map((t) => t.number));
  let n = 1;
  while (used.has(n)) n += 1;
  return n;
}

export type CartinaMirrorView = "ordini" | "schermo";

/** Specchio indipendente per Ordini e Schermo (legacy `mirrored` = entrambi). */
export function isCartinaMirrored(
  prefs: Pick<CartinaPrefs, "mirrored" | "mirrorOrdini" | "mirrorSchermo">,
  view: CartinaMirrorView,
): boolean {
  if (view === "ordini") {
    if (prefs.mirrorOrdini != null) return prefs.mirrorOrdini === true;
    return prefs.mirrored === true;
  }
  if (prefs.mirrorSchermo != null) return prefs.mirrorSchermo === true;
  return prefs.mirrored === true;
}

/** Imposta lo specchio di una vista senza toccare l’altra. */
export function withCartinaMirror(
  prefs: CartinaPrefs,
  view: CartinaMirrorView,
  enabled: boolean,
): CartinaPrefs {
  const next = cloneCartinaFlags(prefs);

  const ordini =
    view === "ordini" ? enabled : isCartinaMirrored(prefs, "ordini");
  const schermo =
    view === "schermo" ? enabled : isCartinaMirrored(prefs, "schermo");

  if (ordini) next.mirrorOrdini = true;
  if (schermo) next.mirrorSchermo = true;
  if (isCenterSymmetry(prefs, "ordini")) next.centerOrdini = true;
  if (isCenterSymmetry(prefs, "schermo")) next.centerSchermo = true;
  return next;
}

export function isCenterSymmetry(
  prefs: Pick<CartinaPrefs, "centerOrdini" | "centerSchermo">,
  view: CartinaMirrorView,
): boolean {
  if (view === "ordini") return prefs.centerOrdini === true;
  return prefs.centerSchermo === true;
}

/** @deprecated usa isCenterSymmetry(prefs, "schermo") */
export function isCenterSchermo(
  prefs: Pick<CartinaPrefs, "centerSchermo" | "centerOrdini">,
): boolean {
  return isCenterSymmetry(prefs, "schermo");
}

export function withCenterSymmetry(
  prefs: CartinaPrefs,
  view: CartinaMirrorView,
  enabled: boolean,
): CartinaPrefs {
  const next = cloneCartinaFlags(prefs);
  if (isCartinaMirrored(prefs, "ordini")) next.mirrorOrdini = true;
  if (isCartinaMirrored(prefs, "schermo")) next.mirrorSchermo = true;

  const ordini =
    view === "ordini" ? enabled : isCenterSymmetry(prefs, "ordini");
  const schermo =
    view === "schermo" ? enabled : isCenterSymmetry(prefs, "schermo");

  if (ordini) next.centerOrdini = true;
  if (schermo) next.centerSchermo = true;
  return next;
}

/** @deprecated usa withCenterSymmetry(prefs, "schermo", enabled) */
export function withCenterSchermo(
  prefs: CartinaPrefs,
  enabled: boolean,
): CartinaPrefs {
  return withCenterSymmetry(prefs, "schermo", enabled);
}

function cloneCartinaFlags(prefs: CartinaPrefs): CartinaPrefs {
  const next: CartinaPrefs = {
    placements: prefs.placements,
    marks: prefs.marks ?? [],
  };
  if (prefs.extraTables?.length) next.extraTables = prefs.extraTables;
  return next;
}

export type CartinaFlip = { flipX: boolean; flipY: boolean };

/** Transform di visualizzazione per Ordini / Schermo. */
export function cartinaFlipForView(
  prefs: Pick<
    CartinaPrefs,
    | "mirrored"
    | "mirrorOrdini"
    | "mirrorSchermo"
    | "centerOrdini"
    | "centerSchermo"
  >,
  view: CartinaMirrorView,
): CartinaFlip {
  const center = isCenterSymmetry(prefs, view);
  const mirror = isCartinaMirrored(prefs, view);
  // Specchio = flip X; centro = 180° (X+Y). Si combinano (XOR):
  // nessuno → identità; solo ↔ → flip X; solo 180° → flip X+Y; entrambi → flip Y.
  return {
    flipX: mirror !== center,
    flipY: center,
  };
}

/** Bordo sinistro di un box dopo eventuale specchio orizzontale */
export function mirrorLeft(x: number, w: number, mirrored: boolean) {
  if (!mirrored) return x;
  return 100 - x - w;
}

export function mirrorTop(y: number, h: number, flipY: boolean) {
  if (!flipY) return y;
  return 100 - y - h;
}

/** Punto (es. testo / estremità linea) dopo eventuale specchio */
export function mirrorCoord(x: number, mirrored: boolean) {
  if (!mirrored) return x;
  return 100 - x;
}

/** Da coordinate visuali (schermo) a coordinate salvate */
export function unmirrorLeft(x: number, w: number, mirrored: boolean) {
  return mirrorLeft(x, w, mirrored);
}

export function unmirrorCoord(x: number, mirrored: boolean) {
  return mirrorCoord(x, mirrored);
}

export function unmirrorTop(y: number, h: number, flipY: boolean) {
  return mirrorTop(y, h, flipY);
}

/** Marks con coordinate ribaltate per il rendering (testo resta leggibile) */
export function marksForDisplay(
  marks: MapMark[],
  flip: boolean | CartinaFlip,
): MapMark[] {
  const f: CartinaFlip =
    typeof flip === "boolean" ? { flipX: flip, flipY: false } : flip;
  if ((!f.flipX && !f.flipY) || marks.length === 0) return marks;
  return marks.map((m) => {
    if (m.kind === "line") {
      return {
        ...m,
        x: mirrorCoord(m.x, f.flipX),
        y: mirrorCoord(m.y, f.flipY),
        x2: mirrorCoord(m.x2 ?? m.x, f.flipX),
        y2: mirrorCoord(m.y2 ?? m.y, f.flipY),
      };
    }
    if (m.kind === "rect") {
      const w = Math.max(1, m.w ?? 10);
      const h = Math.max(1, m.h ?? 10);
      return {
        ...m,
        x: mirrorLeft(m.x, w, f.flipX),
        y: mirrorTop(m.y, h, f.flipY),
        w,
        h,
      };
    }
    return {
      ...m,
      x: mirrorCoord(m.x, f.flipX),
      y: mirrorCoord(m.y, f.flipY),
    };
  });
}

export function normalizePlacement(p: ZoneOnBoard): ZoneOnBoard {
  // Snap fitto cartina (ogni 2%)
  let w = Math.max(CARTINA_GRID_SNAP, snapGrid(Math.max(MIN_ZONE_SIZE, p.w)));
  let h = Math.max(CARTINA_GRID_SNAP, snapGrid(Math.max(MIN_ZONE_SIZE, p.h)));
  w = Math.min(100, w);
  h = Math.min(100, h);
  let x = snapGrid(p.x);
  let y = snapGrid(p.y);
  x = Math.max(0, Math.min(x, 100 - w));
  y = Math.max(0, Math.min(y, 100 - h));
  x = snapGrid(x);
  y = snapGrid(y);
  if (x + w > 100) x = Math.max(0, 100 - w);
  if (y + h > 100) y = Math.max(0, 100 - h);
  const out: ZoneOnBoard = { zoneId: p.zoneId, x, y, w, h };
  if (p.tableGapX === "near" || p.tableGapX === "far") {
    out.tableGapX = p.tableGapX;
  }
  if (p.tableGapY === "near" || p.tableGapY === "far") {
    out.tableGapY = p.tableGapY;
  }
  if (p.hideTitle === true) out.hideTitle = true;
  if (p.hideBorder === true) out.hideBorder = true;
  if (p.rotateText === true) out.rotateText = true;
  const rotation = normalizeZoneRotation(p.rotation);
  if (rotation) out.rotation = rotation;
  if (p.mirror === true) out.mirror = true;
  if (p.center === true) out.center = true;
  return out;
}

export function normalizeZoneRotation(raw: unknown): ZoneRotation | undefined {
  const n = Number(raw);
  if (n === 90 || n === 180 || n === 270) return n;
  return undefined;
}

export function normalizeMarkRotation(raw: unknown): ZoneRotation | undefined {
  return normalizeZoneRotation(raw);
}

export function markRotationDeg(
  mark?: Pick<MapMark, "rotation">,
): ZoneRotation {
  return mark?.rotation ?? 0;
}

/** Trasformata SVG per scritta (rotazione propria + eventuale contro-rotazione zona). */
export function markTextSvgTransform(
  mark: Pick<MapMark, "x" | "y" | "rotation">,
  uprightPlacement?: Pick<ZoneOnBoard, "rotation" | "mirror" | "center">,
): string | undefined {
  const parts: string[] = [];
  const zonePart = uprightPlacement
    ? zoneMarkTextSvgTransform(mark.x, mark.y, uprightPlacement)
    : undefined;
  if (zonePart) parts.push(zonePart);
  const deg = markRotationDeg(mark);
  if (deg) parts.push(`rotate(${deg} ${mark.x} ${mark.y})`);
  return parts.length ? parts.join(" ") : undefined;
}

/** Trasformata CSS per scritte HTML (rotazione uniforme, non distorta dal viewBox SVG). */
export function markTextTransformStyle(
  mark: Pick<MapMark, "rotation">,
  uprightPlacement?: Pick<ZoneOnBoard, "rotation" | "mirror" | "center">,
): { transform?: string; transformOrigin?: string } {
  const parts = ["translate(-50%, -50%)"];
  const zoneCounter = uprightPlacement
    ? zoneTextCounterStyle(uprightPlacement)
    : {};
  if (zoneCounter.transform) parts.push(zoneCounter.transform);
  const deg = markRotationDeg(mark);
  if (deg) parts.push(`rotate(${deg}deg)`);
  return {
    transform: parts.join(" "),
    transformOrigin: "center center",
  };
}

/** Unisce scritte: `preferred` vince su `fallback` per lo stesso id. */
export function mergeCartinaMarks(
  fallback: MapMark[] = [],
  preferred: MapMark[] = [],
): MapMark[] {
  const byId = new Map<string, MapMark>();
  for (const raw of fallback) {
    const mark = normalizeCartinaMark(raw);
    if (mark) byId.set(mark.id, mark);
  }
  for (const raw of preferred) {
    const mark = normalizeCartinaMark(raw);
    if (mark) byId.set(mark.id, { ...byId.get(mark.id), ...mark });
  }
  return Array.from(byId.values());
}

export function zoneRotationDeg(
  placement?: Pick<ZoneOnBoard, "rotation">,
): ZoneRotation {
  return placement?.rotation ?? 0;
}

/** Di default le scritte restano leggibili; con rotateText seguono orientamento zona. */
export function zoneKeepsTextUpright(
  placement?: Pick<ZoneOnBoard, "rotateText">,
): boolean {
  return placement?.rotateText !== true;
}

export function zoneTextCounterStyleIfUpright(
  placement?: Pick<
    ZoneOnBoard,
    "rotation" | "mirror" | "center" | "rotateText"
  >,
): { transform?: string; transformOrigin?: string } {
  if (!zoneKeepsTextUpright(placement)) return {};
  return zoneTextCounterStyle(placement);
}

export function zoneUprightPlacement(
  placement?: Pick<
    ZoneOnBoard,
    "rotation" | "mirror" | "center" | "rotateText"
  >,
): Pick<ZoneOnBoard, "rotation" | "mirror" | "center"> | undefined {
  if (!zoneKeepsTextUpright(placement)) return undefined;
  return placement;
}

/** Flip contenuto zona (stessa logica XOR di cartinaFlipForView). */
export function zoneFlipForPlacement(
  placement?: Pick<ZoneOnBoard, "mirror" | "center">,
): CartinaFlip {
  const mirror = placement?.mirror === true;
  const center = placement?.center === true;
  return { flipX: mirror !== center, flipY: center };
}

export function zoneHasTransform(
  placement?: Pick<ZoneOnBoard, "rotation" | "mirror" | "center">,
): boolean {
  return (
    zoneRotationDeg(placement) !== 0 ||
    zoneFlipForPlacement(placement).flipX ||
    zoneFlipForPlacement(placement).flipY
  );
}

function zoneTransformParts(
  placement?: Pick<ZoneOnBoard, "rotation" | "mirror" | "center">,
  invert = false,
): string[] {
  const sign = invert ? -1 : 1;
  const deg = zoneRotationDeg(placement) * sign;
  const { flipX, flipY } = zoneFlipForPlacement(placement);
  const parts: string[] = [];
  if (deg) parts.push(`rotate(${deg}deg)`);
  if (flipX) parts.push(invert ? "scaleX(-1)" : "scaleX(-1)");
  if (flipY) parts.push(invert ? "scaleY(-1)" : "scaleY(-1)");
  return parts;
}

/** Trasforma layout zona (tavoli, linee, rettangoli). */
export function zoneTransformStyle(
  placement?: Pick<ZoneOnBoard, "rotation" | "mirror" | "center">,
): { transform?: string; transformOrigin?: string } {
  const parts = zoneTransformParts(placement, false);
  if (!parts.length) return {};
  return { transform: parts.join(" "), transformOrigin: "50% 50%" };
}

/** Contro-trasforma testi/numeri così restano leggibili. */
export function zoneTextCounterStyle(
  placement?: Pick<ZoneOnBoard, "rotation" | "mirror" | "center">,
): { transform?: string; transformOrigin?: string } {
  const parts = zoneTransformParts(placement, true);
  if (!parts.length) return {};
  return { transform: parts.join(" "), transformOrigin: "50% 50%" };
}

/** @deprecated usa zoneTransformStyle */
export function zoneRotationStyle(
  placement?: Pick<ZoneOnBoard, "rotation" | "mirror" | "center">,
): { transform?: string; transformOrigin?: string } {
  return zoneTransformStyle(placement);
}

/** Contro-trasforma SVG per scritte zona in viewBox 0–100. */
export function zoneMarkTextSvgTransform(
  x: number,
  y: number,
  placement?: Pick<ZoneOnBoard, "rotation" | "mirror" | "center">,
): string | undefined {
  const deg = zoneRotationDeg(placement);
  const { flipX, flipY } = zoneFlipForPlacement(placement);
  if (!deg && !flipX && !flipY) return undefined;
  const sx = flipX ? -1 : 1;
  const sy = flipY ? -1 : 1;
  return `translate(${x} ${y}) rotate(${-deg}) scale(${sx} ${sy}) translate(${-x} ${-y})`;
}

function clusterAxis(values: number[], tol: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const centers: number[] = [];
  for (const value of sorted) {
    const match = centers.find((c) => Math.abs(c - value) <= tol);
    if (!match) centers.push(value);
  }
  return centers;
}

function nearestClusterIndex(value: number, centers: number[]): number {
  let best = 0;
  let bestDist = Infinity;
  centers.forEach((center, index) => {
    const dist = Math.abs(center - value);
    if (dist < bestDist) {
      bestDist = dist;
      best = index;
    }
  });
  return best;
}

export function normalizeCartinaMark(m: Partial<MapMark>): MapMark | null {
  if (!m || !m.kind) return null;
  const id = m.id || createId();
  const x = clampCartinaCoord(Number(m.x) || 0);
  const y = clampCartinaCoord(Number(m.y) || 0);
  const color = typeof m.color === "string" ? m.color : undefined;
  if (m.kind === "line") {
    const mark: MapMark = {
      id,
      kind: "line",
      x,
      y,
      x2: clampCartinaCoord(Number(m.x2) || x),
      y2: clampCartinaCoord(Number(m.y2) || y),
    };
    if (color) mark.color = color;
    return mark;
  }
  if (m.kind === "rect") {
    const mark: MapMark = {
      id,
      kind: "rect",
      x,
      y,
      w: Math.max(1, Number(m.w) || 10),
      h: Math.max(1, Number(m.h) || 10),
    };
    if (color) mark.color = color;
    return mark;
  }
  const mark: MapMark = {
    id,
    kind: "text",
    x,
    y,
    text: String(m.text ?? "Etichetta"),
  };
  if (color) mark.color = color;
  const fontSize = Number(m.fontSize);
  if (Number.isFinite(fontSize) && fontSize > 0) {
    mark.fontSize = Math.min(16, Math.max(1.2, fontSize));
  }
  const rotation = normalizeMarkRotation(m.rotation);
  if (rotation) mark.rotation = rotation;
  return mark;
}

export function placedZoneIds(prefs: CartinaPrefs): Set<string> {
  return new Set(prefs.placements.map((p) => p.zoneId));
}

export function resolvePlacedZones(
  layout: VenueLayout,
  prefs: CartinaPrefs,
): { zone: ZoneLayout; placement: ZoneOnBoard }[] {
  const byId = new Map(layout.zones.map((z) => [z.id, z]));
  const out: { zone: ZoneLayout; placement: ZoneOnBoard }[] = [];
  for (const p of prefs.placements) {
    const zone = byId.get(p.zoneId);
    if (!zone) continue;
    out.push({ zone, placement: normalizePlacement(p) });
  }
  return out;
}

export interface GuestLabel {
  name: string;
  total: number;
}

export function guestsByTable(
  reservations: Reservation[],
  zoneName: string,
): Map<number, GuestLabel[]> {
  const map = new Map<number, GuestLabel[]>();
  for (const r of reservations) {
    if (r.zone !== zoneName || !r.tableNumber || r.tableNumber <= 0) continue;
    const list = map.get(r.tableNumber) ?? [];
    list.push({ name: r.name.trim() || "—", total: r.total });
    map.set(r.tableNumber, list);
  }
  return map;
}

export function formatGuestLabel(g: GuestLabel): string {
  return `${g.name} (${g.total})`;
}

export function formatTableGuests(guests: GuestLabel[]): string {
  return guests.map(formatGuestLabel).join(" · ");
}

export function tableGridColumns(tableCount: number): number {
  if (tableCount <= 0) return 1;
  if (tableCount <= 4) return Math.min(tableCount, 2);
  if (tableCount <= 9) return 3;
  if (tableCount <= 16) return 4;
  if (tableCount <= 25) return 5;
  return 6;
}

export function sortedTables(zone: ZoneLayout) {
  return [...zone.tables].sort((a, b) => a.number - b.number);
}

export const DEFAULT_ZONE_COLOR = "#2d5a27";

/** Bordo bianco fisso tra i rettangoli tavolo (% area contenuto zona) — “vicini” */
export const TABLE_FILL_GAP = 1.4;

export function tableGapPercent(mode: TableGapMode = "near"): number {
  return mode === "far" ? TABLE_FILL_GAP * 2 : TABLE_FILL_GAP;
}

export function gapsFromPlacement(p?: Pick<ZoneOnBoard, "tableGapX" | "tableGapY">) {
  return {
    gapX: tableGapPercent(p?.tableGapX ?? "near"),
    gapY: tableGapPercent(p?.tableGapY ?? "near"),
  };
}

export function zoneAccentColor(zone: ZoneLayout): string {
  return zone.color || DEFAULT_ZONE_COLOR;
}

export interface TableFillRect {
  table: TableSpot;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Tavoli normali → griglia automatica; tavoli occasional → rettangolo libero x/y/w/h.
 */
export function computeTableFillRects(
  tables: TableSpot[],
  gapX = TABLE_FILL_GAP,
  gapY = TABLE_FILL_GAP,
): TableFillRect[] {
  const gridTables = tables.filter((t) => !t.occasional);
  const freeTables = tables.filter((t) => t.occasional);
  const out: TableFillRect[] = [];

  if (gridTables.length === 1) {
    const t = gridTables[0]!;
    out.push({
      table: t,
      x: gapX / 2,
      y: gapY / 2,
      w: Math.max(1, 100 - gapX),
      h: Math.max(1, 100 - gapY),
    });
  } else if (gridTables.length > 1) {
    const sorted = [...gridTables].sort((a, b) => a.y - b.y || a.x - b.x);
    const rowTol = 7;
    const colTol = 7;
    const rows: TableSpot[][] = [];
    for (const t of sorted) {
      const last = rows[rows.length - 1];
      if (last && Math.abs(last[0]!.y - t.y) <= rowTol) {
        last.push(t);
      } else {
        rows.push([t]);
      }
    }
    rows.forEach((row) => row.sort((a, b) => a.x - b.x));

    const colCenters = clusterAxis(
      gridTables.map((t) => t.x),
      colTol,
    );
    const nRows = rows.length;
    const nCols = Math.max(colCenters.length, 1);
    const cellW = (100 - gapX * (nCols + 1)) / nCols;
    const cellH = (100 - gapY * (nRows + 1)) / nRows;

    rows.forEach((row, ri) => {
      const y = gapY + ri * (cellH + gapY);
      row.forEach((t) => {
        const ci = nearestClusterIndex(t.x, colCenters);
        out.push({
          table: t,
          x: gapX + ci * (cellW + gapX),
          y,
          w: cellW,
          h: cellH,
        });
      });
    });
  }

  for (const t of freeTables) {
    const w = Math.max(2, Number(t.w) || 14);
    const h = Math.max(2, Number(t.h) || 12);
    const x = Math.max(0, Math.min(100 - w, Number(t.x) || 0));
    const y = Math.max(0, Math.min(100 - h, Number(t.y) || 0));
    out.push({ table: t, x, y, w, h });
  }

  return out;
}

export function pointerPercent(
  e: { clientX: number; clientY: number },
  el: HTMLElement,
) {
  const rect = el.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 100;
  const y = ((e.clientY - rect.top) / rect.height) * 100;
  // Lavagna A4: 0–100 (niente margine 8% dei tavoli in editor zona)
  return {
    x: Math.min(100, Math.max(0, x)),
    y: Math.min(100, Math.max(0, y)),
  };
}
