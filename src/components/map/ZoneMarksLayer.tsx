"use client";

import type { MapMark } from "@/lib/types";

export const DEFAULT_MARK_FONT_SIZE = 3.2;

/** Layer di riferimenti (linee, rettangoli, scritte) — non sono tavoli */
export function ZoneMarksLayer({
  marks,
  selectedId,
  interactive = false,
  interactiveKinds,
  onSelect,
  onDragStart,
}: {
  marks: MapMark[];
  selectedId?: string | null;
  interactive?: boolean;
  interactiveKinds?: MapMark["kind"][];
  onSelect?: (id: string) => void;
  onDragStart?: (
    id: string,
    mode: "move" | "resize",
    e: React.PointerEvent,
  ) => void;
}) {
  if (!marks.length) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-20 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden={!interactive}
    >
      {marks.map((mark) => {
        const selected = mark.id === selectedId;
        const canInteract =
          interactive &&
          (interactiveKinds == null || interactiveKinds.includes(mark.kind));
        const base = mark.color || "#2d5a27";
        const stroke = selected ? "#d97706" : base;
        const fill = selected
          ? "rgba(217,119,6,0.12)"
          : hexToRgba(base, 0.1);

        if (mark.kind === "line") {
          return (
            <g key={mark.id}>
              {canInteract ? (
                <line
                  x1={mark.x}
                  y1={mark.y}
                  x2={mark.x2 ?? mark.x}
                  y2={mark.y2 ?? mark.y}
                  stroke="transparent"
                  strokeWidth={5}
                  strokeLinecap="round"
                  className="pointer-events-auto cursor-grab"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onSelect?.(mark.id);
                    onDragStart?.(mark.id, "move", e);
                  }}
                />
              ) : null}
              <line
                x1={mark.x}
                y1={mark.y}
                x2={mark.x2 ?? mark.x}
                y2={mark.y2 ?? mark.y}
                stroke={stroke}
                strokeWidth={selected ? 1.2 : 0.85}
                strokeLinecap="round"
                strokeDasharray={selected ? undefined : "2 1.2"}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        }

        if (mark.kind === "rect") {
          const w = Math.max(1, mark.w ?? 10);
          const h = Math.max(1, mark.h ?? 10);
          return (
            <g key={mark.id}>
              <rect
                x={mark.x}
                y={mark.y}
                width={w}
                height={h}
                fill={fill}
                stroke={stroke}
                strokeWidth={selected ? 1.1 : 0.65}
                strokeDasharray={selected ? undefined : "2 1.2"}
                rx={1.2}
                vectorEffect="non-scaling-stroke"
                className={canInteract ? "pointer-events-auto cursor-grab" : undefined}
                onPointerDown={
                  canInteract
                    ? (e) => {
                        e.stopPropagation();
                        onSelect?.(mark.id);
                        onDragStart?.(mark.id, "move", e);
                      }
                    : undefined
                }
              />
              {canInteract && selected ? (
                <circle
                  cx={mark.x + w}
                  cy={mark.y + h}
                  r={1.8}
                  fill="#f59e0b"
                  stroke="#fff"
                  strokeWidth={0.4}
                  className="pointer-events-auto cursor-nwse-resize"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onSelect?.(mark.id);
                    onDragStart?.(mark.id, "resize", e);
                  }}
                />
              ) : null}
            </g>
          );
        }

        const fontSize = mark.fontSize ?? DEFAULT_MARK_FONT_SIZE;
        const handleX = mark.x + fontSize * 1.6;
        const handleY = mark.y + fontSize * 0.85;
        return (
          <g key={mark.id}>
            <text
              x={mark.x}
              y={mark.y}
              fill={stroke}
              fontSize={fontSize}
              fontWeight={700}
              textAnchor="middle"
              dominantBaseline="middle"
              className={
                canInteract ? "pointer-events-auto cursor-grab" : undefined
              }
              style={{ userSelect: "none" }}
              onPointerDown={
                canInteract
                  ? (e) => {
                      e.stopPropagation();
                      onSelect?.(mark.id);
                      onDragStart?.(mark.id, "move", e);
                    }
                  : undefined
              }
            >
              {mark.text || "Etichetta"}
            </text>
            {canInteract && selected ? (
              <circle
                cx={handleX}
                cy={handleY}
                r={1.8}
                fill="#f59e0b"
                stroke="#fff"
                strokeWidth={0.4}
                className="pointer-events-auto cursor-nwse-resize"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelect?.(mark.id);
                  onDragStart?.(mark.id, "resize", e);
                }}
              />
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  if (h.length !== 6) return `rgba(45,90,39,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
