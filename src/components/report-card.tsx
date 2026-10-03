import { LOW_CONFIDENCE, SCORE_KEYS, SCORE_LABELS, type Assessment } from "@/lib/ai/schemas";

type Props = Pick<Assessment, "scores" | "issues" | "actions">;

export function scoreTone(value: number) {
  if (value >= 70) return { bar: "bg-good", text: "text-good", label: "Good" };
  if (value >= 45) return { bar: "bg-warn", text: "text-warn", label: "Needs attention" };
  return { bar: "bg-bad", text: "text-bad", label: "Act now" };
}

export function HealthBadge({ value, size = "md" }: { value: number; size?: "md" | "lg" }) {
  const tone = scoreTone(value);
  const dims = size === "lg" ? "h-20 w-20 text-3xl" : "h-11 w-11 text-base";
  return (
    <div
      className={`flex ${dims} shrink-0 items-center justify-center rounded-full border-4 font-semibold ${tone.text}`}
      style={{ borderColor: "currentColor" }}
      aria-label={`Health ${value} out of 100: ${tone.label}`}
    >
      <span className="text-foreground">{value}</span>
    </div>
  );
}

export function TodaySteps({ actions }: Pick<Assessment, "actions">) {
  return (
    <ol className="space-y-3">
      {actions.map((a, i) => (
        <li key={i} className="flex gap-3 rounded-2xl border border-border bg-surface p-4">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-leaf-soft text-sm font-semibold text-leaf">
            {i + 1}
          </span>
          <div className="min-w-0">
            <p className="font-medium">{a.step}</p>
            {a.why && (
              <details className="mt-1 text-sm text-muted">
                <summary className="cursor-pointer select-none">Why?</summary>
                <p className="mt-1">{a.why}</p>
              </details>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ReportCard({ scores, issues, actions }: Props) {
  const health = scores.health;
  const rest = SCORE_KEYS.filter((k) => k !== "health");

  return (
    <div className="space-y-8">
      <section className="flex items-center gap-4">
        <HealthBadge value={health.value} size="lg" />
        <div>
          <p className="text-sm text-muted">Overall health · {scoreTone(health.value).label}</p>
          <p className="mt-1 font-medium">{health.why}</p>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Today</h2>
        <div className="mt-3">
          <TodaySteps actions={actions} />
        </div>
      </section>

      {issues.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold">What we noticed</h2>
          <ul className="mt-3 space-y-2">
            {issues.map((issue, i) => {
              const possible = issue.confidence < LOW_CONFIDENCE;
              const tone = issue.severity === "high" ? "text-bad" : issue.severity === "medium" ? "text-warn" : "text-muted";
              return (
                <li key={i} className="rounded-2xl border border-border bg-surface p-4">
                  <p className="font-medium">
                    <span className={tone} aria-hidden>
                      ●{" "}
                    </span>
                    {possible && <span className="text-muted">Possible: </span>}
                    {issue.title}
                  </p>
                  {issue.detail && <p className="mt-1 text-sm text-muted">{issue.detail}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold">Report card</h2>
        <ul className="mt-3 space-y-4">
          {rest.map((key) => {
            const s = scores[key];
            const tone = scoreTone(s.value);
            return (
              <li key={key}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">{SCORE_LABELS[key]}</span>
                  <span className={`font-semibold ${tone.text}`}>{s.value}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-border" aria-hidden>
                  <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.max(s.value, 3)}%` }} />
                </div>
                <p className="mt-1 text-sm text-muted">
                  {s.why}
                  {s.confidence < LOW_CONFIDENCE && " (hard to tell from the photos)"}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="text-xs text-muted">
        This is guidance from photos, not a certainty. If something looks very wrong, trust what you see and feel.
      </p>
    </div>
  );
}
