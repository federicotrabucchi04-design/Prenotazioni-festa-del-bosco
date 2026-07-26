"use client";

/** Barra orizzontale scorrevole per le zone (touch-friendly). */
export function ZoneTabsBar({
  children,
  className = "",
  edgeToEdge = true,
}: {
  children: React.ReactNode;
  className?: string;
  /** Estende ai bordi dello schermo (default true dentro pagine con px-4) */
  edgeToEdge?: boolean;
}) {
  return (
    <div
      className={`relative min-w-0 ${edgeToEdge ? "-mx-4 mb-4" : "mb-3"} ${className}`}
    >
      <div
        className="flex w-full max-w-full gap-2 overflow-x-auto overscroll-x-contain px-4 pb-2 [scrollbar-width:thin] touch-pan-x"
        style={{
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-x",
        }}
      >
        {children}
        {/* Spazio finale: ultima pill raggiungibile e cliccabile */}
        <span className="w-4 shrink-0 basis-4" aria-hidden />
      </div>
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[var(--forest-bg)] to-transparent sm:w-8"
        aria-hidden
      />
    </div>
  );
}
