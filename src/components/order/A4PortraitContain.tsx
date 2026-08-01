"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const A4 = 210 / 297;

/**
 * Contiene la cartina in proporzione A4 verticale.
 * Su TV/monitor landscape evita lo stiramento orizzontale (barre ai lati).
 * Su TV portrait riempie quasi tutto lo schermo.
 */
export function A4PortraitContain({
  children,
  className = "",
  letterboxClassName = "bg-neutral-950",
}: {
  children: ReactNode;
  className?: string;
  letterboxClassName?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    function measure() {
      if (!el) return;
      const pw = el.clientWidth;
      const ph = el.clientHeight;
      if (pw <= 0 || ph <= 0) return;
      // contain: il più grande rettangolo 210×297 che entra in pw×ph
      let w = pw;
      let h = w / A4;
      if (h > ph) {
        h = ph;
        w = h * A4;
      }
      setBox({ w, h });
    }

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={hostRef}
      className={`relative flex h-full w-full items-center justify-center overflow-hidden ${letterboxClassName} ${className}`}
    >
      <div
        className="relative overflow-hidden bg-white"
        style={{
          width: box.w || "100%",
          height: box.h || "100%",
        }}
      >
        {children}
      </div>
    </div>
  );
}
