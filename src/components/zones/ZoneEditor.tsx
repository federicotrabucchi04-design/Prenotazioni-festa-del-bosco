"use client";

import { useMemo, useRef, useState } from "react";
import {
  Plus,
  Save,
  Trash2,
  Pencil,
  Grid3X3,
  CircleDot,
  Minus,
  Square,
  Type,
  MousePointer2,
  Copy,
} from "lucide-react";
import { useVenueLayout } from "@/hooks/use-venue-layout";
import { saveLayout } from "@/lib/layout";
import {
  createDefaultLayout,
  nextTableNumber,
  snapPercent,
  snapGrid,
  TABLE_GRID_SNAP,
} from "@/lib/layout-utils";
import { CARTINA_COLORS, zoneAccentColor } from "@/lib/cartina";
import { createId } from "@/lib/constants";
import type {
  MapMark,
  TableSpot,
  VenueLayout,
  ZoneLayout,
} from "@/lib/types";
import { useUiStore } from "@/store/ui-store";
import { ZoneMarksLayer } from "@/components/map/ZoneMarksLayer";
import { ZoneTabsBar } from "@/components/ZoneTabsBar";
import toast from "react-hot-toast";

type EditorTool = "select" | "table" | "line" | "rect" | "text";

export function ZoneEditor() {
  const { layout: remoteLayout, loading } = useVenueLayout();
  const [draft, setDraft] = useState<VenueLayout | null>(null);
  const layout = draft ?? remoteLayout;
  const selectedZoneName = useUiStore((s) => s.selectedZone);
  const setSelectedZone = useUiStore((s) => s.setSelectedZone);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedMarkId, setSelectedMarkId] = useState<string | null>(null);
  const [tool, setTool] = useState<EditorTool>("table");
  const [saving, setSaving] = useState(false);
  const dragId = useRef<string | null>(null);
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const [draftShape, setDraftShape] = useState<MapMark | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const zoneIndex = Math.max(
    0,
    layout.zones.findIndex((z) => z.name === selectedZoneName),
  );
  const zone: ZoneLayout =
    layout.zones[zoneIndex] ?? layout.zones[0] ?? createDefaultLayout().zones[0]!;

  const marks = zone.marks ?? [];

  const selectedTable = useMemo(
    () => zone.tables.find((t) => t.id === selectedTableId) ?? null,
    [zone.tables, selectedTableId],
  );

  const selectedMark = useMemo(
    () => marks.find((m) => m.id === selectedMarkId) ?? null,
    [marks, selectedMarkId],
  );

  function pointerPercent(e: React.PointerEvent<HTMLElement>) {
    const board = boardRef.current;
    if (!board) return { x: 0, y: 0 };
    const rect = board.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    };
  }

  function snapMark(v: number) {
    return snapGrid(v);
  }

  function updateZone(mutator: (z: ZoneLayout) => ZoneLayout) {
    setDraft((prev) => {
      const base = prev ?? remoteLayout;
      const zones = base.zones.map((z) =>
        z.id === zone.id ? mutator({ ...z, marks: z.marks ?? [] }) : z,
      );
      return { ...base, zones, updatedAt: Date.now() };
    });
  }

  function addTableAt(x: number, y: number) {
    const id = createId();
    updateZone((z) => ({
      ...z,
      tables: [
        ...z.tables,
        {
          id,
          number: nextTableNumber(z),
          x: snapPercent(x),
          y: snapPercent(y),
          capacity: 8,
        },
      ],
    }));
    setSelectedTableId(id);
    setSelectedMarkId(null);
  }

  function onBoardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.dataset.tableId) return;
    if (target.closest("[data-mark-ui]")) return;

    const { x, y } = pointerPercent(e);

    if (tool === "table") {
      addTableAt(x, y);
      toast.success("Tavolo aggiunto");
      return;
    }

    if (tool === "text") {
      const label = window.prompt("Testo di riferimento", "Ingresso");
      if (!label?.trim()) return;
      const id = createId();
      updateZone((z) => ({
        ...z,
        marks: [
          ...(z.marks ?? []),
          {
            id,
            kind: "text",
            x: snapMark(x),
            y: snapMark(y),
            text: label.trim(),
          },
        ],
      }));
      setSelectedMarkId(id);
      setSelectedTableId(null);
      toast.success("Scritta aggiunta");
      return;
    }

    if (tool === "line" || tool === "rect") {
      const sx = snapMark(x);
      const sy = snapMark(y);
      drawStart.current = { x: sx, y: sy };
      setSelectedTableId(null);
      setSelectedMarkId(null);
      setDraftShape({
        id: "draft",
        kind: tool,
        x: sx,
        y: sy,
        x2: sx,
        y2: sy,
        w: 0,
        h: 0,
      });
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    // select: click empty deselects
    setSelectedTableId(null);
    setSelectedMarkId(null);
  }

  function onBoardPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drawStart.current || !draftShape) return;
    const { x, y } = pointerPercent(e);
    const start = drawStart.current;
    const sx = snapMark(x);
    const sy = snapMark(y);

    if (draftShape.kind === "line") {
      setDraftShape({ ...draftShape, x2: sx, y2: sy });
      return;
    }

    if (draftShape.kind === "rect") {
      const left = Math.min(start.x, sx);
      const top = Math.min(start.y, sy);
      setDraftShape({
        ...draftShape,
        x: left,
        y: top,
        w: Math.abs(sx - start.x),
        h: Math.abs(sy - start.y),
      });
    }
  }

  function onBoardPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!drawStart.current || !draftShape) return;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    const start = drawStart.current;
    drawStart.current = null;

    if (draftShape.kind === "line") {
      const x2 = draftShape.x2 ?? start.x;
      const y2 = draftShape.y2 ?? start.y;
      const dist = Math.hypot(x2 - start.x, y2 - start.y);
      setDraftShape(null);
      if (dist < 2) {
        toast.error("Linea troppo corta");
        return;
      }
      const id = createId();
      updateZone((z) => ({
        ...z,
        marks: [
          ...(z.marks ?? []),
          { id, kind: "line", x: start.x, y: start.y, x2, y2 },
        ],
      }));
      setSelectedMarkId(id);
      toast.success("Linea aggiunta");
      return;
    }

    if (draftShape.kind === "rect") {
      const w = draftShape.w ?? 0;
      const h = draftShape.h ?? 0;
      setDraftShape(null);
      if (w < 2 || h < 2) {
        toast.error("Rettangolo troppo piccolo");
        return;
      }
      const id = createId();
      updateZone((z) => ({
        ...z,
        marks: [
          ...(z.marks ?? []),
          {
            id,
            kind: "rect",
            x: draftShape.x,
            y: draftShape.y,
            w,
            h,
          },
        ],
      }));
      setSelectedMarkId(id);
      toast.success("Rettangolo aggiunto");
    }
  }

  function onTablePointerDown(
    e: React.PointerEvent<HTMLButtonElement>,
    table: TableSpot,
  ) {
    e.stopPropagation();
    setSelectedTableId(table.id);
    setSelectedMarkId(null);
    if (tool !== "select" && tool !== "table") return;
    dragId.current = table.id;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onTablePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!dragId.current || !boardRef.current) return;
    const { x, y } = pointerPercent(e);
    const id = dragId.current;
    updateZone((z) => ({
      ...z,
      tables: z.tables.map((t) =>
        t.id === id
          ? { ...t, x: snapPercent(x), y: snapPercent(y) }
          : t,
      ),
    }));
  }

  function onTablePointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    if (dragId.current && boardRef.current) {
      const id = dragId.current;
      const { x, y } = pointerPercent(e);
      updateZone((z) => ({
        ...z,
        tables: z.tables.map((t) =>
          t.id === id
            ? { ...t, x: snapPercent(x), y: snapPercent(y) }
            : t,
        ),
      }));
    }
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
      marks: [],
    };
    setDraft({
      ...layout,
      zones: [...layout.zones, next],
      updatedAt: Date.now(),
    });
    setSelectedZone(next.name);
  }

  function duplicateZone() {
    const suggested = `${zone.name} (copia)`;
    const name = window.prompt("Nome zona duplicata", suggested);
    if (!name?.trim()) return;
    let finalName = name.trim();
    const existing = new Set(layout.zones.map((z) => z.name));
    if (existing.has(finalName)) {
      let n = 2;
      while (existing.has(`${finalName} ${n}`)) n += 1;
      finalName = `${finalName} ${n}`;
    }
    const next: ZoneLayout = {
      id: createId(),
      name: finalName,
      tables: zone.tables.map((t) => ({ ...t, id: createId() })),
      marks: (zone.marks ?? []).map((m) => ({ ...m, id: createId() })),
      ...(zone.color ? { color: zone.color } : {}),
    };
    setDraft({
      ...layout,
      zones: [...layout.zones, next],
      updatedAt: Date.now(),
    });
    setSelectedZone(next.name);
    setSelectedTableId(null);
    setSelectedMarkId(null);
    toast.success(`Zona duplicata: ${next.name}`);
  }

  function setZoneColor(hex: string) {
    updateZone((z) => ({ ...z, color: hex }));
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
    if (!window.confirm(`Eliminare la zona "${zone.name}" e i suoi contenuti?`)) {
      return;
    }
    const zones = layout.zones.filter((z) => z.id !== zone.id);
    setDraft({ ...layout, zones, updatedAt: Date.now() });
    setSelectedZone(zones[0]!.name);
    setSelectedTableId(null);
    setSelectedMarkId(null);
  }

  function deleteSelectedTable() {
    if (!selectedTable) return;
    updateZone((z) => ({
      ...z,
      tables: z.tables.filter((t) => t.id !== selectedTable.id),
    }));
    setSelectedTableId(null);
  }

  function deleteSelectedMark() {
    if (!selectedMark) return;
    updateZone((z) => ({
      ...z,
      marks: (z.marks ?? []).filter((m) => m.id !== selectedMark.id),
    }));
    setSelectedMarkId(null);
  }

  function updateSelectedMark(patch: Partial<MapMark>) {
    if (!selectedMark) return;
    updateZone((z) => ({
      ...z,
      marks: (z.marks ?? []).map((m) =>
        m.id === selectedMark.id ? { ...m, ...patch } : m,
      ),
    }));
  }

  const tools: {
    id: EditorTool;
    label: string;
    icon: typeof CircleDot;
  }[] = [
    { id: "select", label: "Seleziona", icon: MousePointer2 },
    { id: "table", label: "Tavolo", icon: CircleDot },
    { id: "line", label: "Linea", icon: Minus },
    { id: "rect", label: "Rettangolo", icon: Square },
    { id: "text", label: "Scritta", icon: Type },
  ];

  if (loading && !draft) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-sm text-[var(--forest-muted)]">
        Caricamento layout…
      </div>
    );
  }

  const visibleMarks = draftShape ? [...marks, draftShape] : marks;

  return (
    <div className="mx-auto max-w-lg px-4 pb-28 pt-4">
      <div className="mb-3 rounded-2xl border border-white/70 bg-white/80 p-3 text-sm text-[var(--forest-muted)]">
        <p className="flex items-center gap-2 font-semibold text-[var(--forest-ink)]">
          <Grid3X3 className="h-4 w-4 text-[var(--forest)]" />
          Editor zone, tavoli e riferimenti
        </p>
        <p className="mt-1">
          I <strong>tavoli</strong> e i riferimenti (linee, box, scritte) si
          agganciano alla griglia ogni {TABLE_GRID_SNAP}%.
        </p>
      </div>

      <ZoneTabsBar>
        {layout.zones.map((z) => (
          <button
            key={z.id}
            type="button"
            onClick={() => {
              setSelectedZone(z.name);
              setSelectedTableId(null);
              setSelectedMarkId(null);
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
      </ZoneTabsBar>

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
          onClick={duplicateZone}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-[var(--forest)]"
          title="Duplica zona (tavoli e riferimenti)"
        >
          <Copy className="h-4 w-4" />
          Duplica
        </button>
        <button
          type="button"
          onClick={deleteZone}
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-red-50 px-4 text-sm font-semibold text-red-700"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-white px-3 py-2">
        <span className="text-xs font-semibold text-[var(--forest-muted)]">
          Colore zona
        </span>
        {CARTINA_COLORS.map((c) => {
          const active = zoneAccentColor(zone) === c.hex;
          return (
            <button
              key={c.id}
              type="button"
              title={c.label}
              onClick={() => setZoneColor(c.hex)}
              className={`h-8 w-8 rounded-full border-2 ${
                active ? "border-[var(--forest-ink)] scale-110" : "border-white"
              }`}
              style={{ backgroundColor: c.hex }}
            />
          );
        })}
      </div>

      <div className="mb-3 grid grid-cols-5 gap-1.5">
        {tools.map(({ id, label, icon: Icon }) => {
          const active = tool === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTool(id)}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold ${
                active
                  ? "bg-[var(--forest)] text-white"
                  : "bg-white text-[var(--forest-muted)]"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>

      <div
        ref={boardRef}
        onPointerDown={onBoardPointerDown}
        onPointerMove={onBoardPointerMove}
        onPointerUp={onBoardPointerUp}
        onPointerCancel={onBoardPointerUp}
        className="relative aspect-[4/5] w-full touch-none overflow-hidden rounded-3xl border border-[var(--forest)]/15 bg-[linear-gradient(rgba(45,90,39,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(45,90,39,0.1)_1px,transparent_1px)] bg-white shadow-inner"
        style={{ backgroundSize: `${TABLE_GRID_SNAP}% ${TABLE_GRID_SNAP}%` }}
      >
        <ZoneMarksLayer
          marks={visibleMarks}
          selectedId={selectedMarkId}
          interactive={tool === "select"}
          onSelect={(id) => {
            setSelectedMarkId(id);
            setSelectedTableId(null);
          }}
        />

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
              className={`absolute z-10 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-2 text-[11px] font-bold shadow-md transition ${
                active
                  ? "border-amber-400 bg-amber-500 text-white scale-110"
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

        {zone.tables.length === 0 && marks.length === 0 ? (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-[var(--forest-muted)]">
            Scegli uno strumento sopra, poi tocca o trascina sulla griglia
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

      {selectedMark ? (
        <div
          data-mark-ui
          className="mt-3 space-y-3 rounded-2xl border border-white bg-white/90 p-4"
        >
          <p className="text-sm font-semibold text-[var(--forest-ink)]">
            Riferimento:{" "}
            {selectedMark.kind === "line"
              ? "Linea"
              : selectedMark.kind === "rect"
                ? "Rettangolo"
                : "Scritta"}
          </p>
          {selectedMark.kind === "text" ? (
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--forest-muted)]">Testo</span>
              <input
                value={selectedMark.text ?? ""}
                onChange={(e) => updateSelectedMark({ text: e.target.value })}
                className="field-input"
              />
            </label>
          ) : (
            <p className="text-xs text-[var(--forest-muted)]">
              Questo elemento è solo un riferimento visivo: non si assegna alle
              prenotazioni.
            </p>
          )}
          <button
            type="button"
            onClick={deleteSelectedMark}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-50 text-sm font-semibold text-red-700"
          >
            <Trash2 className="h-4 w-4" />
            Elimina riferimento
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
