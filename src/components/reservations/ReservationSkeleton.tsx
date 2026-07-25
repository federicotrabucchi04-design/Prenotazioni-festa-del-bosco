export function ReservationSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-2xl border border-white bg-white/80 p-4 shadow-sm"
        >
          <div className="flex justify-between gap-3">
            <div className="space-y-2">
              <div className="h-5 w-40 rounded-full bg-[var(--forest)]/10" />
              <div className="h-3.5 w-28 rounded-full bg-[var(--forest)]/8" />
            </div>
            <div className="h-12 w-16 rounded-xl bg-[var(--forest)]/10" />
          </div>
          <div className="mt-4 h-8 w-[75%] rounded-full bg-[var(--forest)]/8" />
        </div>
      ))}
    </div>
  );
}
