"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, FlipHorizontal2, LogOut, PlusSquare, RotateCcw, Trash2, Type } from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore, orderRoleLabel } from "@/store/auth-store";
import { useVenueLayout } from "@/hooks/use-venue-layout";
import { useOrderBoard } from "@/hooks/use-order-board";
import {
  OrderCartinaView,
  resolveOrderCartina,
} from "@/components/order/OrderCartinaView";
import { ZoneTabsBar } from "@/components/ZoneTabsBar";
import { OnlineStatusBadge } from "@/components/OnlineStatusBadge";
import { ZoneMarksLayer } from "@/components/map/ZoneMarksLayer";
import {
  getZoneByName,
  TABLE_GRID_SNAP,
  CARTINA_GRID_SNAP,
} from "@/lib/layout-utils";
import { saveLayout } from "@/lib/layout";
import { createId } from "@/lib/constants";
import {
  clearAllAssignments,
  clearAssignmentsUpTo,
  ordersForTable,
  saveOrderCartina,
  setTableOrderNumbers,
  type OrderAssignments,
} from "@/lib/order-board";
import { useAppSettings } from "@/hooks/use-app-settings";
import {
  CARTINA_COLORS,
  isCartinaMirrored,
  isCenterSymmetry,
  loadCartinaPrefs,
  nextExtraTableNumber,
  saveCartinaPrefs,
  withCartinaMirror,
  withCenterSymmetry,
  zoneAccentColor,
  EXTRA_TABLES_ZONE_ID,
  type CartinaExtraTable,
  type CartinaMirrorView,
  type CartinaPrefs,
} from "@/lib/cartina";
import {
  colorForOrderNumber,
  type OrderColorRange,
} from "@/lib/app-settings";
import { OrderNumbersPanel } from "@/components/order/OrderNumbersPanel";
import type { MapMark, ZoneLayout } from "@/lib/types";

/** Assegna numeri d’ordine toccando i tavoli (cartina globale + per zona) */
export function OrderSetupScreen({ embedded = false }: { embedded?: boolean }) {
  const logout = useAuthStore((s) => s.logout);
  const role = useAuthStore((s) => s.role)!;
  const { layout, loading: layoutLoading } = useVenueLayout();
  const { board, loading: boardLoading } = useOrderBoard();
  const { settings } = useAppSettings();
  const [mode, setMode] = useState<"global" | "zone" | "numbers">("global");
  const [zoneName, setZoneName] = useState(layout.zones[0]?.name ?? "");
  const [pending, setPending] = useState<{
    zone: ZoneLayout;
    tableNumber: number;
  } | null>(null);
  const [pendingNums, setPendingNums] = useState<number[]>([]);
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);
  const [tableTool, setTableTool] = useState<
    "none" | "add" | "delete" | "text"
  >("none");
  const [textColor, setTextColor] = useState<string>(CARTINA_COLORS[0]!.hex);
  const [openMenu, setOpenMenu] = useState<null | "tavoli" | "simmetrie" | "numeri">(
    null,
  );
  const maxDigits = settings.orderMaxDigits;

  useEffect(() => {
    if (!zoneName && layout.zones[0]) setZoneName(layout.zones[0].name);
  }, [layout.zones, zoneName]);

  const prefs = useMemo(() => {
    const remote = board.cartina;
    if (remote?.placements.length) return resolveOrderCartina(layout, remote);
    const local = loadCartinaPrefs(layout);
    let merged = local;
    if (remote?.extraTables?.length && !local.extraTables?.length) {
      merged = { ...merged, extraTables: remote.extraTables };
    }
    if (remote?.mirrorOrdini === true && !merged.mirrorOrdini) {
      merged = { ...merged, mirrorOrdini: true };
    }
    if (remote?.mirrorSchermo === true && !merged.mirrorSchermo) {
      merged = { ...merged, mirrorSchermo: true };
    }
    if (remote?.centerOrdini === true && !merged.centerOrdini) {
      merged = { ...merged, centerOrdini: true };
    }
    if (remote?.centerSchermo === true && !merged.centerSchermo) {
      merged = { ...merged, centerSchermo: true };
    }
    if (
      remote?.mirrored === true &&
      !merged.mirrorOrdini &&
      !merged.mirrorSchermo &&
      !merged.mirrored
    ) {
      merged = { ...merged, mirrored: true };
    }
    return resolveOrderCartina(layout, merged);
  }, [board.cartina, layout]);

  const zone = getZoneByName(layout, zoneName) ?? layout.zones[0] ?? null;

  async function persistCartina(next: CartinaPrefs) {
    saveCartinaPrefs(next);
    await saveOrderCartina(next);
  }

  async function savePending(numsOverride?: number[]) {
    if (!pending) return;
    let nums = numsOverride ?? pendingNums;
    if (numsOverride == null && digits) {
      const n = Number(digits);
      if (Number.isFinite(n) && n > 0) {
        const f = Math.floor(n);
        if (!nums.includes(f)) nums = [...nums, f];
      }
    }
    setBusy(true);
    try {
      await setTableOrderNumbers(
        pending.zone.id,
        pending.tableNumber,
        nums,
      );
      toast.success(
        nums.length
          ? `Tavolo ${pending.tableNumber} → ${nums.join(", ")}`
          : "Numeri rimossi",
      );
      setPending(null);
      setPendingNums([]);
      setDigits("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  function addDigitNumber() {
    if (!digits) return;
    const n = Number(digits);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Numero non valido");
      return;
    }
    const f = Math.floor(n);
    setPendingNums((cur) => (cur.includes(f) ? cur : [...cur, f]));
    setDigits("");
  }

  function openAssign(zone: ZoneLayout, tableNumber: number) {
    if (tableTool !== "none") return;
    setPending({ zone, tableNumber });
    setPendingNums(ordersForTable(board.assignments, zone.id, tableNumber));
    setDigits("");
  }

  async function handleDrawExtraTable(rect: {
    x: number;
    y: number;
    w: number;
    h: number;
  }) {
    setBusy(true);
    try {
      const existing = prefs.extraTables ?? [];
      const number = nextExtraTableNumber(existing);
      const table: CartinaExtraTable = {
        id: createId(),
        number,
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h,
      };
      const next: CartinaPrefs = {
        ...prefs,
        extraTables: [...existing, table],
      };
      await persistCartina(next);
      toast.success(`Tavolo extra ${number} aggiunto`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore salvataggio");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteExtraTable(table: CartinaExtraTable) {
    if (
      !window.confirm(
        `Eliminare il tavolo extra ${table.number}? I numeri d’ordine su di esso verranno tolti.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const next: CartinaPrefs = {
        ...prefs,
        extraTables: (prefs.extraTables ?? []).filter((t) => t.id !== table.id),
      };
      if (!next.extraTables?.length) {
        const { extraTables: _drop, ...rest } = next;
        await persistCartina(rest);
      } else {
        await persistCartina(next);
      }
      await setTableOrderNumbers(EXTRA_TABLES_ZONE_ID, table.number, []);
      toast.success(`Tavolo extra ${table.number} eliminato`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteZoneOccasional(zone: ZoneLayout, tableId: string) {
    const table = zone.tables.find((t) => t.id === tableId);
    if (!table) return;
    if (
      !window.confirm(
        `Eliminare il tavolo ${table.number} da ${zone.name}?`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await saveLayout({
        ...layout,
        updatedAt: Date.now(),
        zones: layout.zones.map((z) =>
          z.id === zone.id
            ? { ...z, tables: z.tables.filter((t) => t.id !== tableId) }
            : z,
        ),
      });
      await setTableOrderNumbers(zone.id, table.number, []);
      toast.success(`Tavolo ${table.number} eliminato`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  async function handlePlaceText(pos: { x: number; y: number }) {
    const label = window.prompt("Testo da inserire sulla cartina", "");
    if (!label?.trim()) return;
    setBusy(true);
    try {
      const mark: MapMark = {
        id: createId(),
        kind: "text",
        x: pos.x,
        y: pos.y,
        text: label.trim(),
        color: textColor,
        fontSize: 3.2,
      };
      const next: CartinaPrefs = {
        ...prefs,
        marks: [...(prefs.marks ?? []), mark],
      };
      await persistCartina(next);
      toast.success("Scritta aggiunta");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  async function toggleMirror(view: CartinaMirrorView) {
    setBusy(true);
    try {
      const enabling = !isCartinaMirrored(prefs, view);
      const next = withCartinaMirror(prefs, view, enabling);
      await persistCartina(next);
      toast.success(
        enabling
          ? view === "ordini"
            ? "Ordini specchiato"
            : "Schermo specchiato"
          : view === "ordini"
            ? "Specchio Ordini disattivato"
            : "Specchio Schermo disattivato",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  async function toggleCenter(view: CartinaMirrorView) {
    setBusy(true);
    try {
      const enabling = !isCenterSymmetry(prefs, view);
      const next = withCenterSymmetry(prefs, view, enabling);
      await persistCartina(next);
      toast.success(
        enabling
          ? view === "ordini"
            ? "Simmetria centro Ordini attiva"
            : "Simmetria centro Schermo attiva"
          : view === "ordini"
            ? "Simmetria centro Ordini disattivata"
            : "Simmetria centro Schermo disattivata",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  async function handleClearUpTo() {
    const raw = window.prompt(
      "Azzera tutti i numeri d’ordine fino a (incluso):",
      "",
    );
    if (raw == null) return;
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Numero non valido");
      return;
    }
    if (
      !window.confirm(
        `Cancellare tutti i numeri d’ordine da 1 a ${n} (inclusi)?`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const result = await clearAssignmentsUpTo(n);
      toast.success(
        result.removed
          ? `Rimossi ${result.removed} numeri ≤ ${n}`
          : `Nessun numero ≤ ${n} da rimuovere`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  if (layoutLoading || boardLoading) {
    return (
      <div
        className={`flex items-center justify-center bg-[var(--forest-bg)] ${
          embedded ? "h-full" : "min-h-dvh"
        }`}
      >
        <div className="h-10 w-10 animate-pulse rounded-2xl bg-[var(--forest)]/20" />
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col bg-[var(--forest-bg)] ${
        embedded ? "h-full overflow-hidden" : "h-dvh max-h-dvh overflow-hidden"
      }`}
    >
      {!embedded ? (
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/50 bg-white/80 px-4 pb-3 pt-[max(0.85rem,env(safe-area-inset-top))] backdrop-blur-xl md:px-6">
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--forest)]">
                Modalità servizio · tablet
              </p>
              <OnlineStatusBadge />
            </div>
            <h1 className="text-lg font-semibold text-[var(--forest-ink)] md:text-xl">
              {orderRoleLabel(role)}
            </h1>
            <p className="text-sm text-[var(--forest-muted)]">
              {tableTool === "add"
                ? "Disegna un rettangolo ovunque sulla cartina (anche fuori zona)"
                : tableTool === "delete"
                  ? "Tocca un tavolo extra per eliminarlo"
                  : tableTool === "text"
                    ? "Tocca la cartina per inserire una scritta colorata"
                    : "Tocca un tavolo e digita il numero d’ordine"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              logout();
              toast.success("Disconnesso");
            }}
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--forest)]/8 text-[var(--forest)] touch-manipulation"
            aria-label="Esci"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </header>
      ) : (
        <div className="shrink-0 border-b border-white/40 bg-white/80 px-2 pb-1 pt-6">
          <p className="text-[10px] font-semibold text-[var(--forest-muted)]">
            Tocca tavolo → numero ordine
          </p>
        </div>
      )}

      <div
        className={`mx-auto flex min-h-0 w-full flex-1 flex-col ${
          embedded ? "" : "max-w-5xl"
        }`}
      >
        <div className={`flex gap-2 ${embedded ? "px-1.5 py-1" : "px-4 py-2 md:px-6"}`}>
          {(
            [
              { id: "global" as const, label: embedded ? "Globale" : "Cartina" },
              { id: "zone" as const, label: "Per zona" },
              { id: "numbers" as const, label: "Numeri" },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setMode(id);
                if (id !== "global") setTableTool("none");
                setOpenMenu(null);
              }}
              className={`flex-1 font-semibold touch-manipulation ${
                embedded
                  ? "rounded-xl py-1.5 text-[11px]"
                  : "rounded-2xl py-3 text-sm md:text-base"
              } ${
                mode === id
                  ? "bg-[var(--forest)] text-white"
                  : "bg-white text-[var(--forest-ink)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "global" ? (
          <div
            className={`relative z-20 flex flex-wrap items-start gap-2 ${
              embedded ? "px-1.5 pb-1" : "px-4 pb-2 md:px-6"
            }`}
          >
            {/* Tavoli */}
            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  setOpenMenu((m) => (m === "tavoli" ? null : "tavoli"))
                }
                className={`inline-flex items-center gap-1 rounded-2xl px-3 py-2.5 text-xs font-semibold touch-manipulation md:text-sm ${
                  openMenu === "tavoli" || tableTool !== "none"
                    ? "bg-[var(--forest)] text-white"
                    : "bg-white text-[var(--forest-ink)]"
                }`}
              >
                Tavoli
                <ChevronDown
                  className={`h-3.5 w-3.5 transition ${
                    openMenu === "tavoli" ? "rotate-180" : ""
                  }`}
                />
              </button>
              {openMenu === "tavoli" ? (
                <div className="absolute left-0 top-full z-30 mt-1 min-w-[11rem] rounded-2xl border border-[var(--forest)]/15 bg-white p-1.5 shadow-lg">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setTableTool((t) => (t === "add" ? "none" : "add"));
                      setPending(null);
                      setOpenMenu(null);
                    }}
                    className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-semibold touch-manipulation ${
                      tableTool === "add"
                        ? "bg-[var(--forest)] text-white"
                        : "text-[var(--forest-ink)] hover:bg-[var(--forest)]/5"
                    }`}
                  >
                    <PlusSquare className="h-3.5 w-3.5" />
                    Aggiungi tavolo
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setTableTool((t) => (t === "text" ? "none" : "text"));
                      setPending(null);
                      setOpenMenu(null);
                    }}
                    className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-semibold touch-manipulation ${
                      tableTool === "text"
                        ? "bg-[var(--forest)] text-white"
                        : "text-[var(--forest-ink)] hover:bg-[var(--forest)]/5"
                    }`}
                  >
                    <Type className="h-3.5 w-3.5" />
                    Scritta
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setTableTool((t) => (t === "delete" ? "none" : "delete"));
                      setPending(null);
                      setOpenMenu(null);
                    }}
                    className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-semibold touch-manipulation ${
                      tableTool === "delete"
                        ? "bg-red-600 text-white"
                        : "text-red-700 hover:bg-red-50"
                    }`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Elimina tavolo
                  </button>
                </div>
              ) : null}
            </div>

            {/* Simmetrie */}
            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  setOpenMenu((m) => (m === "simmetrie" ? null : "simmetrie"))
                }
                className={`inline-flex items-center gap-1 rounded-2xl px-3 py-2.5 text-xs font-semibold touch-manipulation md:text-sm ${
                  openMenu === "simmetrie" ||
                  isCartinaMirrored(prefs, "ordini") ||
                  isCartinaMirrored(prefs, "schermo") ||
                  isCenterSymmetry(prefs, "ordini") ||
                  isCenterSymmetry(prefs, "schermo")
                    ? "bg-[var(--forest)] text-white"
                    : "bg-white text-[var(--forest-ink)]"
                }`}
              >
                <FlipHorizontal2 className="h-3.5 w-3.5" />
                Simmetrie
                <ChevronDown
                  className={`h-3.5 w-3.5 transition ${
                    openMenu === "simmetrie" ? "rotate-180" : ""
                  }`}
                />
              </button>
              {openMenu === "simmetrie" ? (
                <div className="absolute left-0 top-full z-30 mt-1 min-w-[14rem] rounded-2xl border border-[var(--forest)]/15 bg-white p-1.5 shadow-lg">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggleMirror("ordini")}
                    className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs font-semibold touch-manipulation ${
                      isCartinaMirrored(prefs, "ordini")
                        ? "bg-[var(--forest)] text-white"
                        : "text-[var(--forest-ink)] hover:bg-[var(--forest)]/5"
                    }`}
                  >
                    Specchia Ordini
                    <span className="text-[10px] opacity-70">↔</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggleMirror("schermo")}
                    className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs font-semibold touch-manipulation ${
                      isCartinaMirrored(prefs, "schermo")
                        ? "bg-sky-600 text-white"
                        : "text-sky-950 hover:bg-sky-50"
                    }`}
                  >
                    Specchia Schermo
                    <span className="text-[10px] opacity-70">↔</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggleCenter("ordini")}
                    className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs font-semibold touch-manipulation ${
                      isCenterSymmetry(prefs, "ordini")
                        ? "bg-violet-600 text-white"
                        : "text-violet-950 hover:bg-violet-50"
                    }`}
                  >
                    Centro Ordini
                    <span className="text-[10px] opacity-70">180°</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggleCenter("schermo")}
                    className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs font-semibold touch-manipulation ${
                      isCenterSymmetry(prefs, "schermo")
                        ? "bg-violet-600 text-white"
                        : "text-violet-950 hover:bg-violet-50"
                    }`}
                  >
                    Centro Schermo
                    <span className="text-[10px] opacity-70">180°</span>
                  </button>
                </div>
              ) : null}
            </div>

            {/* Numeri */}
            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  setOpenMenu((m) => (m === "numeri" ? null : "numeri"))
                }
                className={`inline-flex items-center gap-1 rounded-2xl px-3 py-2.5 text-xs font-semibold touch-manipulation md:text-sm ${
                  openMenu === "numeri"
                    ? "bg-red-600 text-white"
                    : "bg-white text-red-700"
                }`}
              >
                Numeri
                <ChevronDown
                  className={`h-3.5 w-3.5 transition ${
                    openMenu === "numeri" ? "rotate-180" : ""
                  }`}
                />
              </button>
              {openMenu === "numeri" ? (
                <div className="absolute left-0 top-full z-30 mt-1 min-w-[12rem] rounded-2xl border border-red-100 bg-white p-1.5 shadow-lg">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setOpenMenu(null);
                      if (!window.confirm("Cancellare tutti i numeri d’ordine?"))
                        return;
                      await clearAllAssignments();
                      toast.success("Assegnazioni azzerate");
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-red-700 touch-manipulation hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Azzera tutti
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setOpenMenu(null);
                      void handleClearUpTo();
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-red-700 touch-manipulation hover:bg-red-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Azzera fino a…
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : mode !== "numbers" ? (
          <div
            className={`relative z-20 ${
              embedded ? "px-1.5 pb-1" : "px-4 pb-2 md:px-6"
            }`}
          >
            <div className="relative inline-block">
              <button
                type="button"
                onClick={() =>
                  setOpenMenu((m) => (m === "numeri" ? null : "numeri"))
                }
                className={`inline-flex items-center gap-1 rounded-2xl px-3 py-2.5 text-xs font-semibold touch-manipulation md:text-sm ${
                  openMenu === "numeri"
                    ? "bg-red-600 text-white"
                    : "bg-white text-red-700"
                }`}
              >
                Numeri
                <ChevronDown
                  className={`h-3.5 w-3.5 transition ${
                    openMenu === "numeri" ? "rotate-180" : ""
                  }`}
                />
              </button>
              {openMenu === "numeri" ? (
                <div className="absolute left-0 top-full z-30 mt-1 min-w-[12rem] rounded-2xl border border-red-100 bg-white p-1.5 shadow-lg">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setOpenMenu(null);
                      if (!window.confirm("Cancellare tutti i numeri d’ordine?"))
                        return;
                      await clearAllAssignments();
                      toast.success("Assegnazioni azzerate");
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-red-700 touch-manipulation hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Azzera tutti
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setOpenMenu(null);
                      void handleClearUpTo();
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-red-700 touch-manipulation hover:bg-red-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Azzera fino a…
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {tableTool !== "none" && mode === "global" ? (
          <div
            className={`pb-1 ${embedded ? "px-1.5" : "px-4 md:px-6"}`}
          >
            <p
              className={`text-xs font-medium ${
                tableTool === "delete"
                  ? "text-red-700"
                  : "text-[var(--forest)]"
              }`}
            >
              {tableTool === "add"
                ? `Trascina un rettangolo ovunque · griglia ${CARTINA_GRID_SNAP}% · tap di nuovo per uscire`
                : tableTool === "text"
                  ? "Scegli il colore, poi tocca dove vuoi la scritta · tap di nuovo su Scritta per uscire"
                  : "Tocca un tavolo extra (bordo rosso) per eliminarlo · tap di nuovo per uscire"}
            </p>
            {tableTool === "text" ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {CARTINA_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    title={c.label}
                    onClick={() => setTextColor(c.hex)}
                    className={`h-7 w-7 rounded-full border-2 touch-manipulation ${
                      textColor === c.hex
                        ? "border-[var(--forest-ink)] scale-110"
                        : "border-white/80"
                    }`}
                    style={{ backgroundColor: c.hex }}
                    aria-label={c.label}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div
          className={`flex min-h-0 flex-1 flex-col overflow-auto ${
            embedded
              ? "px-0.5 pb-1"
              : "px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:px-4"
          }`}
        >
          {mode === "numbers" ? (
            <OrderNumbersPanel
              assignments={board.assignments}
              start={settings.orderNumberStart}
              searchAhead={settings.orderSearchAhead}
              recentExtras={settings.orderRecentExtras}
              colorRanges={settings.orderColorRanges}
              variant="setup"
            />
          ) : mode === "global" ? (
            <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-[var(--forest)]/15 bg-white md:min-h-[min(70dvh,820px)]">
              <OrderCartinaView
                layout={layout}
                prefs={prefs}
                assignments={board.assignments}
                highlight={null}
                interactive
                drawTableMode={tableTool === "add"}
                deleteTableMode={tableTool === "delete"}
                textPlaceMode={tableTool === "text"}
                numberScale={
                  embedded
                    ? Math.max(0.85, settings.orderNumberScale)
                    : Math.max(1, settings.orderNumberScale)
                }
                colorRanges={settings.orderColorRanges}
                onTableClick={openAssign}
                onDrawTable={(rect) => {
                  void handleDrawExtraTable(rect);
                }}
                onDeleteExtraTable={(table) => {
                  void handleDeleteExtraTable(table);
                }}
                onDeleteZoneOccasional={(z, tableId) => {
                  void handleDeleteZoneOccasional(z, tableId);
                }}
                onPlaceText={(pos) => {
                  void handlePlaceText(pos);
                }}
              />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <ZoneTabsBar edgeToEdge={false} className="mb-0 shrink-0">
                {layout.zones.map((z) => (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => setZoneName(z.name)}
                    className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold touch-manipulation md:px-5 md:py-3 md:text-base ${
                      z.name === zone?.name
                        ? "bg-[var(--forest)] text-white"
                        : "bg-white text-[var(--forest-ink)]"
                    }`}
                  >
                    {z.name}
                  </button>
                ))}
              </ZoneTabsBar>
              {zone ? (
                <ZoneOrderMap
                  zone={zone}
                  assignments={board.assignments}
                  colorRanges={settings.orderColorRanges}
                  onTableClick={openAssign}
                />
              ) : null}
            </div>
          )}
        </div>
      </div>

      {pending ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-3xl bg-white p-4 shadow-xl md:p-6">
            <p className="text-sm text-[var(--forest-muted)] md:text-base">
              {pending.zone.name} · tavolo {pending.tableNumber}
            </p>
            <p className="mt-1 text-xs text-[var(--forest-muted)]">
              Puoi mettere più numeri sullo stesso tavolo
            </p>

            {pendingNums.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {pendingNums.map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setPendingNums((cur) => cur.filter((x) => x !== n))
                    }
                    className="inline-flex items-center gap-1.5 rounded-full bg-[var(--forest)] px-3 py-1.5 text-sm font-bold text-white"
                    title="Togli numero"
                  >
                    {n}
                    <span className="text-xs opacity-80">×</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-center text-sm text-[var(--forest-muted)]">
                Nessun numero ancora
              </p>
            )}

            <p className="mt-3 text-center text-4xl font-black tracking-wider text-[var(--forest-ink)] tabular-nums md:text-5xl">
              {digits || "—"}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2 md:gap-3">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map(
                (k) => (
                  <button
                    key={k}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (k === "C") setDigits("");
                      else if (k === "⌫") setDigits((d) => d.slice(0, -1));
                      else if (digits.length < maxDigits) setDigits((d) => d + k);
                    }}
                    className="h-14 rounded-2xl bg-[var(--forest)]/8 text-xl font-bold text-[var(--forest-ink)] touch-manipulation active:scale-95 md:h-16 md:text-2xl"
                  >
                    {k}
                  </button>
                ),
              )}
            </div>
            <button
              type="button"
              disabled={busy || !digits}
              onClick={addDigitNumber}
              className="mt-3 w-full rounded-2xl bg-[var(--forest)]/10 py-3 text-sm font-bold text-[var(--forest)] touch-manipulation disabled:opacity-50"
            >
              Aggiungi numero
            </button>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setPending(null);
                  setPendingNums([]);
                  setDigits("");
                }}
                className="flex-1 rounded-2xl bg-[var(--forest)]/10 py-3.5 text-sm font-semibold text-[var(--forest)] touch-manipulation"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setPendingNums([]);
                  setDigits("");
                }}
                className="rounded-2xl bg-red-50 px-4 py-3.5 text-sm font-semibold text-red-700 touch-manipulation"
              >
                Svuota
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void savePending()}
                className="flex-1 rounded-2xl bg-[var(--forest)] py-3.5 text-sm font-bold text-white touch-manipulation disabled:opacity-50"
              >
                Salva
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Vista zona come in editor tavoli (posizioni x/y), non griglia inventata */
function ZoneOrderMap({
  zone,
  assignments,
  colorRanges,
  onTableClick,
}: {
  zone: ZoneLayout;
  assignments: OrderAssignments;
  colorRanges: OrderColorRange[];
  onTableClick: (zone: ZoneLayout, tableNumber: number) => void;
}) {
  const accent = zoneAccentColor(zone);
  const marks = zone.marks ?? [];

  return (
    <div className="mx-auto w-full max-w-lg">
      <div
        className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl border-2 bg-[linear-gradient(rgba(45,90,39,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(45,90,39,0.1)_1px,transparent_1px)] bg-white shadow-inner"
        style={{
          backgroundSize: `${TABLE_GRID_SNAP}% ${TABLE_GRID_SNAP}%`,
          borderColor: accent,
        }}
      >
        <div
          className="absolute inset-x-0 top-0 z-20 px-2 py-1.5 text-center text-sm font-bold text-white"
          style={{ backgroundColor: accent }}
        >
          {zone.name}
        </div>
        <div className="absolute inset-0 pt-8">
          <ZoneMarksLayer marks={marks} />
          {zone.tables.map((table) => {
            const nums = ordersForTable(assignments, zone.id, table.number);
            return (
              <button
                key={table.id}
                type="button"
                onClick={() => onTableClick(zone, table.number)}
                className={`absolute z-10 flex min-h-16 min-w-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-2xl border-2 px-2 py-1.5 text-center shadow-sm touch-manipulation active:scale-95 ${
                  nums.length ? "bg-white" : "bg-white/95"
                }`}
                style={{
                  left: `${table.x}%`,
                  top: `${table.y}%`,
                  borderColor: nums.length ? accent : `${accent}55`,
                }}
                title={`Tavolo ${table.number}`}
              >
                <span
                  className="text-[9px] font-bold uppercase tracking-wide"
                  style={{ color: accent }}
                >
                  T{table.number}
                </span>
                {nums.length > 0 ? (
                  <span
                    className="max-w-[5.5rem] px-0.5 text-center font-black leading-tight tabular-nums"
                    style={{
                      fontSize:
                        nums.length > 3
                          ? "0.75rem"
                          : nums.length > 1
                            ? "1rem"
                            : "1.2rem",
                      color: colorForOrderNumber(nums[0]!, colorRanges),
                    }}
                  >
                    {nums.join("-")}
                  </span>
                ) : (
                  <span className="text-[10px] font-medium opacity-40" style={{ color: accent }}>
                    ·
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
