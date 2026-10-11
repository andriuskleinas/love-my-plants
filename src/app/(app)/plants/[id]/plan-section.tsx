import { FEED_EVERY_DAYS } from "@/lib/care/log";
import type { RepotDetails } from "@/lib/care/plan.server";
import { RepottedButton } from "./repotted-button";

type Milestone = { type: string; target_date: string; details: unknown };

const monthYear = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
const dayMonth = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "long" });

/** Long-term plan: next repot window and feeding season (plan F5). */
export function PlanSection({
  plantId,
  potCm,
  milestones,
  fertilizer,
  lastFedAt,
}: {
  plantId: string;
  potCm: number;
  milestones: Milestone[];
  fertilizer: string | null;
  /** Last logged feeding, if any. */
  lastFedAt: string | null;
}) {
  const repot = milestones.find((m) => m.type === "repot");
  const feed = milestones.find((m) => m.type === "fertilize_season");
  if (!repot && !feed) return null;
  const r = repot?.details as RepotDetails | undefined;
  const f = feed?.details as { start: string; end: string; active: boolean } | undefined;
  const lastFed = lastFedAt ? new Date(lastFedAt) : null;
  const nextFeed = lastFed ? new Date(lastFed.getTime() + FEED_EVERY_DAYS * 86_400_000) : null;
  const shortDate = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric", month: "long" });

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">Plan</h2>
      <ol className="mt-3 space-y-3">
        {repot && r && (
          <li className="rounded-2xl border border-border bg-surface p-4">
            <p className="font-medium">
              🪴 Repot{" "}
              {r.urgency === "later" ? (
                <span className="text-muted">around {monthYear(repot.target_date)}</span>
              ) : (
                <span className="text-terracotta">{r.urgency === "now" ? "now" : `from ${dayMonth(repot.target_date)}`}</span>
              )}
            </p>
            <p className="mt-1 text-sm">
              Into a <b>{r.recommendedPotCm} cm</b> pot (now {potCm} cm), with a drainage hole and fresh soil.
            </p>
            {r.reasons.length > 0 && <p className="mt-1 text-sm text-muted">Why: {r.reasons.join("; ")}.</p>}
            {r.urgency === "later" && (
              <p className="mt-1 text-sm text-muted">No signs it needs a bigger pot yet. We&apos;ll check again at every check-in.</p>
            )}
            <RepottedButton plantId={plantId} currentCm={potCm} recommendedCm={r.recommendedPotCm} />
          </li>
        )}
        {feed && f && (
          <li className="rounded-2xl border border-border bg-surface p-4">
            <p className="font-medium">
              🌱 Feeding season{" "}
              <span className="text-muted">
                {f.active ? `now, until ${dayMonth(f.end)}` : `starts ${dayMonth(f.start)}`}
              </span>
            </p>
            <p className="mt-1 text-sm text-muted">
              {f.active
                ? fertilizer ?? "Feed with a liquid houseplant fertilizer about once a month."
                : "Plants rest in the darker months, so no fertilizer until then."}
            </p>
            {lastFed && nextFeed && (
              <p className="mt-1 text-sm">
                Last fed <b>{shortDate(lastFed)}</b>
                {f.active && (nextFeed <= new Date() ? ". Time for the next feed." : `. Next feed around ${shortDate(nextFeed)}.`)}
              </p>
            )}
          </li>
        )}
      </ol>
    </section>
  );
}
