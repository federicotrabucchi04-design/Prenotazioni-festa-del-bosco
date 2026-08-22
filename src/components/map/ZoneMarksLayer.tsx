"use client";

import type { MapMark } from "@/lib/types";
import { markTextTransformStyle } from "@/lib/cartina";
import type { ZoneOnBoard } from "@/lib/cartina";

export const DEFAULT_MARK_FONT_SIZE = 3.2;

/** Layer di riferimenti (linee, rettangoli, scritte) — non sono tavoli */
export function ZoneMarksLayer({
  marks,
  selectedId,
  interactive = false,
  interactiveKinds,
  onSelect,
  onDragStart,
  uprightPlacement,
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
  /** Scritte sempre leggibili nonostante rotazione/specchio zona */
  uprightPlacement?: Pick<ZoneOnBoard, "rotation" | "mirror" | "center">;
}) {
  if (!marks.length) return null;

  const lineRectMarks = marks.filter((m) => m.kind !== "text");
  const textMarks = marks.filter((m) => m.kind === "text");

  return (
    <>
      {lineRectMarks.length > 0 ? (
        <svg
          className="pointer-events-none absolute inset-0 z-20 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden={!interactive}
        >
          {lineRectMarks.map((mark) => {
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
                  className={
                    canInteract ? "pointer-events-auto cursor-grab" : undefined
                  }
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
          })}
        </svg>
      ) : null}

      {textMarks.length > 0 ? (
        <div
          className="pointer-events-none absolute inset-0 z-20"
          aria-hidden={!interactive}
        >
          {textMarks.map((mark) => {
            const selected = mark.id === selectedId;
            const canInteract =
              interactive &&
              (interactiveKinds == null || interactiveKinds.includes("text"));
            const base = mark.color || "#2d5a27";
            const stroke = selected ? "#d97706" : base;
            const fontSize = mark.fontSize ?? DEFAULT_MARK_FONT_SIZE;
            const textStyle = markTextTransformStyle(mark, uprightPlacement);

            return (
              <div
                key={mark.id}
                className={`absolute whitespace-nowrap font-bold leading-none ${
                  canInteract ? "pointer-events-auto cursor-grab" : ""
                }`}
                style={{
                  left: `${mark.x}%`,
                  top: `${mark.y}%`,
                  color: stroke,
                  fontSize: `max(8px, ${fontSize * 0.95}cqmin)`,
                  userSelect: "none",
                  ...textStyle,
                }}
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
                {canInteract && selected ? (
                  <span
                    className="pointer-events-auto absolute left-full top-full ml-0.5 mt-0.5 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-full border border-white bg-amber-500"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onSelect?.(mark.id);
                      onDragStart?.(mark.id, "resize", e);
                    }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </>
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
