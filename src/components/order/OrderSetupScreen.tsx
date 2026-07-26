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
import { getZoneByName } from "@/lib/layout-utils";
import {
  assignmentKey,
  clearAllAssignments,
  saveOrderCartina,
  setTableOrderNumber,
} from "@/lib/order-board";
import {
  autoPlaceZones,
  loadCartinaPrefs,
  saveCartinaPrefs,
  sortedTables,
  tableGridColumns,
} from "@/lib/cartina";
import type { ZoneLayout } from "@/lib/types";

/** Assegna numeri d’ordine toccando i tavoli (cartina globale + per zona) */
export function OrderSetupScreen() {
  const logout = useAuthStore((s) => s.logout);
  const role = useAuthStore((s) => s.role)!;
  const { layout, loading: layoutLoading } = useVenueLayout();
  const { board, loading: boardLoading } = useOrderBoard();
  const [mode, setMode] = useState<"global" | "zone">("global");
  const [zoneName, setZoneName] = useState(layout.zones[0]?.name ?? "");
  const [pending, setPending] = useState<{
    zone: ZoneLayout;
    tableNumber: number;
  } | null>(null);
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);

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

  async function assign(orderNumber: number | null) {
    if (!pending) return;
    setBusy(true);
    try {
      await setTableOrderNumber(
        pending.zone.id,
        pending.tableNumber,
        orderNumber,
      );
      // Assicura che la cartina sia su Firebase per lo schermo
      if (!board.cartina?.placements.length) {
        await saveOrderCartina(prefs);
      }
      toast.success(
        orderNumber
          ? `Tavolo ${pending.tableNumber} → ordine ${orderNumber}`
          : "Numero rimosso",
      );
      setPending(null);
      setDigits("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  function openAssign(zone: ZoneLayout, tableNumber: number) {
    const key = assignmentKey(zone.id, tableNumber);
    const current = board.assignments[key];
    setPending({ zone, tableNumber });
    setDigits(current ? String(current) : "");
  }

  if (layoutLoading || boardLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--forest-bg)]">
        <div className="h-10 w-10 animate-pulse rounded-2xl bg-[var(--forest)]/20" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--forest-bg)]">
      <header className="flex items-start justify-between gap-3 border-b border-white/50 bg-white/80 px-4 pb-3 pt-[max(0.85rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--forest)]">
            Modalità servizio
          </p>
          <h1 className="text-lg font-semibold text-[var(--forest-ink)]">
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
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--forest)]/8 text-[var(--forest)]"
          aria-label="Esci"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      <div className="flex gap-2 px-4 py-2">
        <button
          type="button"
          onClick={() => setMode("global")}
          className={`flex-1 rounded-2xl py-2.5 text-sm font-semibold ${
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
          className={`flex-1 rounded-2xl py-2.5 text-sm font-semibold ${
            mode === "zone"
              ? "bg-[var(--forest)] text-white"
              : "bg-white text-[var(--forest-ink)]"
          }`}
        >
          Per zona
        </button>
      </div>

      <div className="flex gap-2 px-4 pb-2">
        <button
          type="button"
          onClick={() => void syncCartinaFromLocal()}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-[var(--forest)]"
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
          className="inline-flex items-center gap-1 rounded-2xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Azzera
        </button>
      </div>

      <div className="min-h-0 flex-1 px-3 pb-4">
        {mode === "global" ? (
          <div className="h-[min(70vh,560px)] overflow-hidden rounded-3xl border border-[var(--forest)]/15 bg-white shadow-sm">
            <OrderCartinaView
              layout={layout}
              prefs={prefs}
              assignments={board.assignments}
              highlight={board.highlight}
              interactive
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
                  className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold ${
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

      {pending ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-3xl bg-white p-4 shadow-xl">
            <p className="text-sm text-[var(--forest-muted)]">
              {pending.zone.name} · tavolo {pending.tableNumber}
            </p>
            <p className="mt-1 text-center text-4xl font-black tracking-wider text-[var(--forest-ink)]">
              {digits || "—"}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map(
                (k) => (
                  <button
                    key={k}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (k === "C") setDigits("");
                      else if (k === "⌫") setDigits((d) => d.slice(0, -1));
                      else if (digits.length < 4) setDigits((d) => d + k);
                    }}
                    className="h-14 rounded-2xl bg-[var(--forest)]/8 text-xl font-bold text-[var(--forest-ink)] active:scale-95"
                  >
                    {k}
                  </button>
                ),
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setPending(null);
                  setDigits("");
                }}
                className="flex-1 rounded-2xl bg-[var(--forest)]/10 py-3 text-sm font-semibold text-[var(--forest)]"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void assign(null)}
                className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
              >
                Rimuovi
              </button>
              <button
                type="button"
                disabled={busy || !digits}
                onClick={() => void assign(Number(digits))}
                className="flex-1 rounded-2xl bg-[var(--forest)] py-3 text-sm font-bold text-white disabled:opacity-50"
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
  assignments: Record<string, number>;
  onTableClick: (zone: ZoneLayout, tableNumber: number) => void;
}) {
  const tables = sortedTables(zone);
  const cols = tableGridColumns(tables.length);
  return (
    <div
      className="grid gap-2 rounded-3xl border border-[var(--forest)]/10 bg-white p-3"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {tables.map((t) => {
        const n = assignments[assignmentKey(zone.id, t.number)];
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onTableClick(zone, t.number)}
            className={`flex aspect-square flex-col items-center justify-center rounded-2xl border-2 ${
              n
                ? "border-[var(--forest)] bg-[var(--forest)]/10"
                : "border-dashed border-[var(--forest)]/25 bg-[var(--forest)]/5"
            }`}
          >
            <span className="text-[10px] text-[var(--forest-muted)]">
              T{t.number}
            </span>
            <span className="text-lg font-black text-[var(--forest-ink)]">
              {n ?? "—"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
