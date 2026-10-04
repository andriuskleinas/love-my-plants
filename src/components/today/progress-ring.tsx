/** "2 of 5 done today" as a small ring; a tick once everything is done. */
export function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const share = total ? done / total : 0;
  const complete = total > 0 && done >= total;
  return (
    <div className="relative h-14 w-14 shrink-0" role="img" aria-label={`${done} of ${total} done today`}>
      <svg viewBox="0 0 48 48" className="h-14 w-14 -rotate-90" aria-hidden>
        <circle cx="24" cy="24" r={r} fill="none" stroke="var(--leaf-soft)" strokeWidth="5" />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          stroke="var(--leaf)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - share)}
          className="transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold" aria-hidden>
        {complete ? "✓" : `${done}/${total}`}
      </span>
    </div>
  );
}
