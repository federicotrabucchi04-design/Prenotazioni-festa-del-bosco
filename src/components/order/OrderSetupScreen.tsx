"use client";

import { useMemo, useState } from "react";
import { LogOut, MapPinned, Trash2 } from "lucide-react";
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
import { getZoneByName } from "@/lib/layout-utils";
import {
  clearAllAssignments,
  ordersForTable,
  saveOrderCartina,
  setTableOrderNumbers,
  type OrderAssignments,
} from "@/lib/order-board";
import { useAppSettings } from "@/hooks/use-app-settings";
import {
  autoPlaceZones,
  loadCartinaPrefs,
  saveCartinaPrefs,
  sortedTables,
  tableGridColumns,
} from "@/lib/cartina";
import type { ZoneLayout } from "@/lib/types";

/** Assegna numeri d’ordine toccando i tavoli (cartina globale + per zona) */
export function OrderSetupScreen({ embedded = false }: { embedded?: boolean }) {
  const logout = useAuthStore((s) => s.logout);
  const role = useAuthStore((s) => s.role)!;
  const { layout, loading: layoutLoading } = useVenueLayout();
  const { board, loading: boardLoading } = useOrderBoard();
  const { settings } = useAppSettings();
  const [mode, setMode] = useState<"global" | "zone">("global");
  const [zoneName, setZoneName] = useState(layout.zones[0]?.name ?? "");
  const [pending, setPending] = useState<{
    zone: ZoneLayout;
    tableNumber: number;
  } | null>(null);
  const [pendingNums, setPendingNums] = useState<number[]>([]);
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);
  const maxDigits = settings.orderMaxDigits;

  const prefs = useMemo(() => {
    const remote = board.cartina;
    if (remote?.placements.length) return resolveOrderCartina(layout, remote);
    return resolveOrderCartina(layout, loadCartinaPrefs(layout));
  }, [board.cartina, layout]);

  const zone = getZoneByName(layout, zoneName) ?? layout.zones[0] ?? null;

  async function syncCartinaFromLocal() {
    const local = loadCartinaPrefs(layout);
    const next =
      local.placements.length > 0
        ? local
        : { placements: autoPlaceZones(layout.zones), marks: [] };
    saveCartinaPrefs(next);
    await saveOrderCartina(next);
    toast.success("Disposizione cartina sincronizzata");
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
      await saveOrderCartina(prefs);
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
    setPending({ zone, tableNumber });
    setPendingNums(ordersForTable(board.assignments, zone.id, tableNumber));
    setDigits("");
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
              Tocca un tavolo e digita il numero d’ordine
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
          <button
            type="button"
            onClick={() => setMode("global")}
            className={`flex-1 font-semibold touch-manipulation ${
              embedded
                ? "rounded-xl py-1.5 text-[11px]"
                : "rounded-2xl py-3 text-sm md:text-base"
            } ${
              mode === "global"
                ? "bg-[var(--forest)] text-white"
                : "bg-white text-[var(--forest-ink)]"
            }`}
          >
            Cartina globale
          </button>
          <button
            type="button"
            onClick={() => setMode("zone")}
            className={`flex-1 font-semibold touch-manipulation ${
              embedded
                ? "rounded-xl py-1.5 text-[11px]"
                : "rounded-2xl py-3 text-sm md:text-base"
            } ${
              mode === "zone"
                ? "bg-[var(--forest)] text-white"
                : "bg-white text-[var(--forest-ink)]"
            }`}
          >
            Per zona
          </button>
        </div>

        {!embedded ? (
          <div className="flex gap-2 px-4 pb-2 md:px-6">
            <button
              type="button"
              onClick={() => void syncCartinaFromLocal()}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-white px-3 py-2.5 text-xs font-semibold text-[var(--forest)] touch-manipulation md:text-sm"
            >
              <MapPinned className="h-3.5 w-3.5" />
              Sincronizza disposizione
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm("Cancellare tutti i numeri d’ordine?")) return;
                await clearAllAssignments();
                toast.success("Assegnazioni azzerate");
              }}
              className="inline-flex items-center gap-1 rounded-2xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700 touch-manipulation md:text-sm"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Azzera
            </button>
          </div>
        ) : null}

        <div
          className={`flex min-h-0 flex-1 flex-col overflow-auto ${
            embedded
              ? "px-0.5 pb-1"
              : "px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:px-4"
          }`}
        >
          {mode === "global" ? (
            <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-[var(--forest)]/15 bg-white md:min-h-[min(70dvh,820px)]">
              <OrderCartinaView
                layout={layout}
                prefs={prefs}
                assignments={board.assignments}
                highlight={null}
                interactive
                numberScale={
                  embedded
                    ? Math.max(0.5, settings.orderNumberScale * 0.65)
                    : Math.max(1, settings.orderNumberScale * 1.1)
                }
                colorRanges={settings.orderColorRanges}
                onTableClick={openAssign}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <ZoneTabsBar edgeToEdge={false} className="mb-0">
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
                <ZoneOrderGrid
                  zone={zone}
                  assignments={board.assignments}
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

function ZoneOrderGrid({
  zone,
  assignments,
  onTableClick,
}: {
  zone: ZoneLayout;
  assignments: OrderAssignments;
  onTableClick: (zone: ZoneLayout, tableNumber: number) => void;
}) {
  const tables = sortedTables(zone);
  const cols = tableGridColumns(tables.length);
  return (
    <div
      className="grid gap-2 rounded-3xl border border-[var(--forest)]/10 bg-white p-3 md:gap-3 md:p-4"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {tables.map((t) => {
        const nums = ordersForTable(assignments, zone.id, t.number);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onTableClick(zone, t.number)}
            className={`flex min-h-[4.5rem] flex-col items-center justify-center overflow-hidden rounded-2xl border-2 px-1 touch-manipulation active:scale-95 md:min-h-[5.5rem] ${
              nums.length
                ? "border-[var(--forest)] bg-[var(--forest)]/10"
                : "border-dashed border-[var(--forest)]/25 bg-[var(--forest)]/5"
            }`}
          >
            <span className="text-[10px] text-[var(--forest-muted)] md:text-xs">
              T{t.number}
            </span>
            <span
              className={`font-black leading-tight text-[var(--forest-ink)] ${
                nums.length > 2
                  ? "text-sm md:text-base"
                  : nums.length === 2
                    ? "text-base md:text-xl"
                    : "text-lg md:text-2xl"
              }`}
            >
              {nums.length ? nums.join(" · ") : "—"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
