"use client";

/** Guide tratteggiate sui limiti di visualizzazione (TV / stampa / area sicura). */
export function CartinaViewportGuides() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[5] h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      {/* Bordo = TV verticale / Schermo / stampa A4 (tutta la lavagna) */}
      <rect
        x="0.5"
        y="0.5"
        width="99"
        height="99"
        fill="none"
        stroke="#2563eb"
        strokeWidth="0.45"
        strokeDasharray="2.2 1.4"
        vectorEffect="non-scaling-stroke"
      />
      <text
        x="2"
        y="3.4"
        fill="#2563eb"
        fontSize="2.1"
        fontWeight={700}
        style={{ userSelect: "none" }}
      >
        TV verticale · Schermo · A4
      </text>

      {/* Area sicura (meglio non superare) */}
      <rect
        x="4"
        y="4"
        width="92"
        height="92"
        fill="none"
        stroke="#ca8a04"
        strokeWidth="0.35"
        strokeDasharray="1.6 1.2"
        vectorEffect="non-scaling-stroke"
      />
      <text
        x="5"
        y="7"
        fill="#ca8a04"
        fontSize="1.7"
        fontWeight={650}
        style={{ userSelect: "none" }}
      >
        Area sicura
      </text>

      {/* Riferimento se qualcuno apre lo schermo in orizzontale: fascia “comoda” */}
      <rect
        x="1"
        y="14"
        width="98"
        height="72"
        fill="none"
        stroke="#b91c1c"
        strokeWidth="0.3"
        strokeDasharray="1.2 1.6"
        opacity={0.75}
        vectorEffect="non-scaling-stroke"
      />
      <text
        x="2"
        y="16.8"
        fill="#b91c1c"
        fontSize="1.55"
        fontWeight={650}
        opacity={0.85}
        style={{ userSelect: "none" }}
      >
        Evita: TV in orizzontale (proporzioni sbagliate)
      </text>

      {/* Croce centrale leggera per allineamento */}
      <line
        x1="50"
        y1="8"
        x2="50"
        y2="92"
        stroke="#94a3b8"
        strokeWidth="0.15"
        strokeDasharray="0.8 1.2"
        opacity={0.5}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1="8"
        y1="50"
        x2="92"
        y2="50"
        stroke="#94a3b8"
        strokeWidth="0.15"
        strokeDasharray="0.8 1.2"
        opacity={0.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
