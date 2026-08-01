"use client";

import { useEffect, useState } from "react";

export type DeviceKind = "phone" | "tablet" | "desktop" | "tv";

export interface ViewportInfo {
  width: number;
  height: number;
  /** Lato lungo in verticale (TV / telefono in piedi) */
  portrait: boolean;
  kind: DeviceKind;
  /** TV o monitor alto in portrait: cartina a tutto schermo */
  isPortraitDisplay: boolean;
  /** Schermo stretto tipo telefono */
  isPhone: boolean;
  /** Tablet / iPad-ish */
  isTablet: boolean;
}

function compute(width: number, height: number): ViewportInfo {
  const portrait = height >= width;
  const minSide = Math.min(width, height);
  const maxSide = Math.max(width, height);

  let kind: DeviceKind = "desktop";
  if (minSide < 480) kind = "phone";
  else if (minSide < 900) kind = "tablet";
  else if (portrait && maxSide >= 900) kind = "tv";
  else kind = "desktop";

  return {
    width,
    height,
    portrait,
    kind,
    isPortraitDisplay: portrait && maxSide >= 700,
    isPhone: kind === "phone",
    isTablet: kind === "tablet",
  };
}

/** Info viewport per adattare tastierino / ordini / TV verticale / PC */
export function useViewport(): ViewportInfo {
  const [info, setInfo] = useState<ViewportInfo>(() => {
    if (typeof window === "undefined") {
      return compute(1024, 768);
    }
    return compute(window.innerWidth, window.innerHeight);
  });

  useEffect(() => {
    function update() {
      setInfo(compute(window.innerWidth, window.innerHeight));
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return info;
}
