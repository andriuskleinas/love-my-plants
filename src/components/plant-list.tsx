import Link from "next/link";
import { HealthBadge } from "@/components/report-card";
import { dueLabel } from "@/lib/plants/format";

export type PlantRow = {
  id: string;
  nickname: string;
  species_name: string | null;
  status: string;
  photoUrl: string | null;
  health: number | null;
  waterDue: string | null;
};

/** One card per plant: photo, name, next watering and health. */
export function PlantList({ plants }: { plants: PlantRow[] }) {
  return (
    <ul className="mt-3 space-y-3">
      {plants.map((p) => {
        const due = p.waterDue ? new Date(p.waterDue) : null;
        return (
          <li key={p.id}>
            <Link href={`/plants/${p.id}`} className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-3">
              {p.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                <img src={p.photoUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-leaf-soft text-2xl">🪴</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {p.status === "er" && "🚨 "}
                  {p.nickname}
                </p>
                {p.species_name && <p className="truncate text-sm italic text-muted">{p.species_name}</p>}
                {due && <p className="mt-0.5 text-sm text-muted">💧 Water {dueLabel(due)}</p>}
              </div>
              {p.health != null && <HealthBadge value={p.health} />}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
