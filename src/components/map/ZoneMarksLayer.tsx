"use client";

import type { MapMark } from "@/lib/types";

/** Layer di riferimenti (linee, rettangoli, scritte) — non sono tavoli */
export function ZoneMarksLayer({
  marks,
  selectedId,
  interactive = false,
  onSelect,
}: {
  marks: MapMark[];
  selectedId?: string | null;
  interactive?: boolean;
  onSelect?: (id: string) => void;
}) {
  if (!marks.length) return null;

  return (
    <svg
      className={`absolute inset-0 h-full w-full ${
        interactive ? "pointer-events-auto" : "pointer-events-none"
      }`}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden={!interactive}
    >
      {marks.map((mark) => {
        const selected = mark.id === selectedId;
        const stroke = selected ? "#d97706" : "#2d5a27";
        const fill = selected ? "rgba(217,119,6,0.12)" : "rgba(45,90,39,0.08)";

        if (mark.kind === "line") {
          return (
            <g key={mark.id}>
              {/* hit area più larga in editor */}
              {interactive ? (
                <line
                  x1={mark.x}
                  y1={mark.y}
                  x2={mark.x2 ?? mark.x}
                  y2={mark.y2 ?? mark.y}
                  stroke="transparent"
                  strokeWidth={4}
                  strokeLinecap="round"
                  className="cursor-pointer"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onSelect?.(mark.id);
                  }}
                />
              ) : null}
              <line
                x1={mark.x}
                y1={mark.y}
                x2={mark.x2 ?? mark.x}
                y2={mark.y2 ?? mark.y}
                stroke={stroke}
                strokeWidth={selected ? 1.2 : 0.7}
                strokeLinecap="round"
                strokeDasharray={selected ? undefined : "2 1.2"}
                vectorEffect="non-scaling-stroke"
                className={interactive ? "pointer-events-none" : undefined}
              />
            </g>
          );
        }

        if (mark.kind === "rect") {
          const w = Math.max(1, mark.w ?? 10);
          const h = Math.max(1, mark.h ?? 10);
          return (
            <rect
              key={mark.id}
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
              className={interactive ? "cursor-pointer" : undefined}
              onPointerDown={
                interactive
                  ? (e) => {
                      e.stopPropagation();
                      onSelect?.(mark.id);
                    }
                  : undefined
              }
            />
          );
        }

        // text
        return (
          <text
            key={mark.id}
            x={mark.x}
            y={mark.y}
            fill={stroke}
            fontSize={3.2}
            fontWeight={600}
            textAnchor="middle"
            dominantBaseline="middle"
            className={interactive ? "cursor-pointer" : undefined}
            style={{ userSelect: "none" }}
            onPointerDown={
              interactive
                ? (e) => {
                    e.stopPropagation();
                    onSelect?.(mark.id);
                  }
                : undefined
            }
          >
            {mark.text || "Etichetta"}
          </text>
        );
      })}
    </svg>
  );
}
