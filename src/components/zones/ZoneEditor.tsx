"use client";

import { useMemo, useRef, useState } from "react";
import {
  Plus,
  Save,
  Trash2,
  Pencil,
  Grid3X3,
} from "lucide-react";
import { useVenueLayout } from "@/hooks/use-venue-layout";
import { saveLayout } from "@/lib/layout";
import {
  clampPercent,
  createDefaultLayout,
  nextTableNumber,
} from "@/lib/layout-utils";
import { createId } from "@/lib/constants";
import type { TableSpot, VenueLayout, ZoneLayout } from "@/lib/types";
import { useUiStore } from "@/store/ui-store";
import toast from "react-hot-toast";

export function ZoneEditor() {
  const { layout: remoteLayout, loading } = useVenueLayout();
  const [draft, setDraft] = useState<VenueLayout | null>(null);
  const layout = draft ?? remoteLayout;
  const selectedZoneName = useUiStore((s) => s.selectedZone);
  const setSelectedZone = useUiStore((s) => s.setSelectedZone);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dragId = useRef<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const zoneIndex = Math.max(
    0,
    layout.zones.findIndex((z) => z.name === selectedZoneName),
  );
  const zone: ZoneLayout =
    layout.zones[zoneIndex] ?? layout.zones[0] ?? createDefaultLayout().zones[0]!;

  const selectedTable = useMemo(
    () => zone.tables.find((t) => t.id === selectedTableId) ?? null,
    [zone.tables, selectedTableId],
  );

  function updateZone(mutator: (z: ZoneLayout) => ZoneLayout) {
    setDraft((prev) => {
      const base = prev ?? remoteLayout;
      const zones = base.zones.map((z) =>
        z.id === zone.id ? mutator(z) : z,
      );
      return { ...base, zones, updatedAt: Date.now() };
    });
  }

  function addTableAt(x: number, y: number) {
    updateZone((z) => ({
      ...z,
      tables: [
        ...z.tables,
        {
          id: createId(),
          number: nextTableNumber(z),
          x: clampPercent(x),
          y: clampPercent(y),
          capacity: 8,
        },
      ],
    }));
  }

  function onBoardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).dataset.tableId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    addTableAt(x, y);
    toast.success("Tavolo aggiunto — trascinalo per posizionarlo");
  }

  function onTablePointerDown(
    e: React.PointerEvent<HTMLButtonElement>,
    table: TableSpot,
  ) {
    e.stopPropagation();
    setSelectedTableId(table.id);
    dragId.current = table.id;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onTablePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!dragId.current || !boardRef.current) return;
    const rect = boardRef.current.getBoundingClientRect();
    const x = clampPercent(((e.clientX - rect.left) / rect.width) * 100);
    const y = clampPercent(((e.clientY - rect.top) / rect.height) * 100);
    const id = dragId.current;
    updateZone((z) => ({
      ...z,
      tables: z.tables.map((t) => (t.id === id ? { ...t, x, y } : t)),
    }));
  }

  function onTablePointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    dragId.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  async function onSave() {
    setSaving(true);
    try {
      const saved = await saveLayout(layout);
      setDraft(saved);
      toast.success("Layout zone salvato");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  }

  function addZone() {
    const name = window.prompt("Nome nuova zona", `Zona ${layout.zones.length + 1}`);
    if (!name?.trim()) return;
    const next: ZoneLayout = {
      id: createId(),
      name: name.trim(),
      tables: [],
    };
    setDraft({
      ...layout,
      zones: [...layout.zones, next],
      updatedAt: Date.now(),
    });
    setSelectedZone(next.name);
  }

  function renameZone() {
    const name = window.prompt("Rinomina zona", zone.name);
    if (!name?.trim()) return;
    const newName = name.trim();
    setDraft({
      ...layout,
      zones: layout.zones.map((z) =>
        z.id === zone.id ? { ...z, name: newName } : z,
      ),
      updatedAt: Date.now(),
    });
    setSelectedZone(newName);
  }

  function deleteZone() {
    if (layout.zones.length <= 1) {
      toast.error("Serve almeno una zona");
      return;
    }
    if (!window.confirm(`Eliminare la zona "${zone.name}" e i suoi tavoli?`)) {
      return;
    }
    const zones = layout.zones.filter((z) => z.id !== zone.id);
    setDraft({ ...layout, zones, updatedAt: Date.now() });
    setSelectedZone(zones[0]!.name);
    setSelectedTableId(null);
  }

  function deleteSelectedTable() {
    if (!selectedTable) return;
    updateZone((z) => ({
      ...z,
      tables: z.tables.filter((t) => t.id !== selectedTable.id),
    }));
    setSelectedTableId(null);
  }

  if (loading && !draft) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-sm text-[var(--forest-muted)]">
        Caricamento layout…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-28 pt-4">
      <div className="mb-3 rounded-2xl border border-white/70 bg-white/80 p-3 text-sm text-[var(--forest-muted)]">
        <p className="flex items-center gap-2 font-semibold text-[var(--forest-ink)]">
          <Grid3X3 className="h-4 w-4 text-[var(--forest)]" />
          Editor zone e tavoli
        </p>
        <p className="mt-1">
          Tocca la griglia per aggiungere un tavolo. Trascina i punti per
          posizionarli. Imposta la capacità di ciascuno.
        </p>
      </div>

      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none">
        {layout.zones.map((z) => (
          <button
            key={z.id}
            type="button"
            onClick={() => {
              setSelectedZone(z.name);
              setSelectedTableId(null);
            }}
            className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold ${
              z.name === zone.name
                ? "bg-[var(--forest)] text-white"
                : "bg-white/80 text-[var(--forest-ink)]"
            }`}
          >
            {z.name}
            <span className="ml-2 text-[10px] opacity-80">{z.tables.length}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={addZone}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--forest)]/10 px-3 py-2.5 text-sm font-semibold text-[var(--forest)]"
        >
          <Plus className="h-4 w-4" />
          Zona
        </button>
      </div>

      <div className="mb-3 flex gap-2">
        <button
          type="button"
          onClick={renameZone}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-[var(--forest)]"
        >
          <Pencil className="h-4 w-4" />
          Rinomina
        </button>
        <button
          type="button"
          onClick={deleteZone}
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-red-50 px-4 text-sm font-semibold text-red-700"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div
        ref={boardRef}
        onPointerDown={onBoardPointerDown}
        className="relative aspect-[4/5] w-full touch-none overflow-hidden rounded-3xl border border-[var(--forest)]/15 bg-[linear-gradient(rgba(45,90,39,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(45,90,39,0.06)_1px,transparent_1px)] bg-size-[24px_24px] bg-white shadow-inner"
      >
        {zone.tables.map((table) => {
          const active = table.id === selectedTableId;
          return (
            <button
              key={table.id}
              type="button"
              data-table-id={table.id}
              onPointerDown={(e) => onTablePointerDown(e, table)}
              onPointerMove={onTablePointerMove}
              onPointerUp={onTablePointerUp}
              onPointerCancel={onTablePointerUp}
              style={{ left: `${table.x}%`, top: `${table.y}%` }}
              className={`absolute flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-2 text-[11px] font-bold shadow-md transition ${
                active
                  ? "z-10 border-amber-400 bg-amber-500 text-white scale-110"
                  : "border-white bg-[var(--forest)] text-white"
              }`}
            >
              <span>{table.number}</span>
              <span className="text-[9px] font-medium opacity-90">
                {table.capacity}p
              </span>
            </button>
          );
        })}
        {zone.tables.length === 0 ? (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-[var(--forest-muted)]">
            Tocca qui per posizionare il primo tavolo
          </p>
        ) : null}
      </div>

      {selectedTable ? (
        <div className="mt-3 space-y-3 rounded-2xl border border-white bg-white/90 p-4">
          <p className="text-sm font-semibold text-[var(--forest-ink)]">
            Tavolo selezionato
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--forest-muted)]">Numero</span>
              <input
                type="number"
                min={1}
                value={selectedTable.number}
                onChange={(e) => {
                  const number = Math.max(1, Number(e.target.value) || 1);
                  updateZone((z) => ({
                    ...z,
                    tables: z.tables.map((t) =>
                      t.id === selectedTable.id ? { ...t, number } : t,
                    ),
                  }));
                }}
                className="field-input"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--forest-muted)]">
                Capacità max
              </span>
              <input
                type="number"
                min={1}
                value={selectedTable.capacity}
                onChange={(e) => {
                  const capacity = Math.max(1, Number(e.target.value) || 1);
                  updateZone((z) => ({
                    ...z,
                    tables: z.tables.map((t) =>
                      t.id === selectedTable.id ? { ...t, capacity } : t,
                    ),
                  }));
                }}
                className="field-input"
              />
            </label>
          </div>
          <p className="text-xs text-[var(--forest-muted)]">
            Assegnazioni multiple ammesse fino a{" "}
            <strong>{selectedTable.capacity + 2}</strong> persone (capacità + 2),
            oltre serve conferma.
          </p>
          <button
            type="button"
            onClick={deleteSelectedTable}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-50 text-sm font-semibold text-red-700"
          >
            <Trash2 className="h-4 w-4" />
            Elimina tavolo
          </button>
        </div>
      ) : null}

      <button
        type="button"
        disabled={saving}
        onClick={() => void onSave()}
        className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--forest)] text-base font-semibold text-white shadow-lg shadow-[var(--forest)]/25 disabled:opacity-60"
      >
        <Save className="h-5 w-5" />
        {saving ? "Salvataggio…" : "Salva layout"}
      </button>
    </div>
  );
}
