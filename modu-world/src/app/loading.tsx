export default function Loading() {
  return (
    <div className="container-x py-16" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="h-4 w-32 animate-pulse rounded-full bg-white/10" />
      <div className="mt-4 h-10 w-2/3 max-w-xl animate-pulse rounded-2xl bg-white/10" />
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card h-64 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
