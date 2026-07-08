// Lightweight loading skeletons (pulse animation, theme-safe). Used in place of
// "Loading…" text while data fetches, so the layout appears instantly.

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200 dark:bg-slate-700 ${className}`} />;
}

// Mirrors the Home BU-card grid.
export function BuCardsSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-2xl border border-indigo-100/70 bg-white p-3.5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-2 w-1/3" />
          <Skeleton className="mt-0.5 h-6 w-3/4" />
          <Skeleton className="mt-1 h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

// Mirrors a comparison / P&L table.
export function TableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-0">
      <div className="border-b border-slate-200 p-3 dark:border-slate-700">
        <Skeleton className="h-3 w-28" />
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4 px-4 py-3">
            <Skeleton className="h-3 w-36" />
            <div className="flex gap-4 sm:gap-8">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-3 w-14" />
              <Skeleton className="hidden h-3 w-14 sm:block" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
