/** Grey placeholder blocks shown while a page loads. */
export function Bone({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-border/60 motion-reduce:animate-none ${className}`} />;
}

/** A page-shaped placeholder: title, then a few cards. */
export function PageSkeleton({ cards = 3, cardClass = "h-24" }: { cards?: number; cardClass?: string }) {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 pb-12 lg:max-w-2xl pt-[max(1rem,env(safe-area-inset-top))]" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <Bone className="h-8 w-40 rounded-xl" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: cards }, (_, i) => (
          <Bone key={i} className={cardClass} />
        ))}
      </div>
    </main>
  );
}
