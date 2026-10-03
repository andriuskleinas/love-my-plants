// Vacation prep checklist (plan F8). Rule-based so advice is predictable and free.
import { lightFactor, type Hemisphere, type PotMaterial, type WindowDirection } from "./watering";

const DAY_MS = 24 * 60 * 60 * 1000;

export type PrepWhen = "week_before" | "day_before" | "leaving" | "return";
export const PREP_WHEN_LABELS: Record<PrepWhen, string> = {
  week_before: "This week",
  day_before: "The day before you leave",
  leaving: "As you leave",
  return: "When you're back",
};

export interface VacationPlant {
  id: string;
  nickname: string;
  /** Current watering interval in days. */
  intervalDays: number;
  windowDirection: WindowDirection;
  potMaterial: PotMaterial;
  inRescue: boolean;
}

export interface PrepItem {
  key: string;
  plantId: string | null;
  when: PrepWhen;
  text: string;
}

export function tripDays(startsAt: Date, endsAt: Date): number {
  return Math.max(1, Math.ceil((endsAt.getTime() - startsAt.getTime()) / DAY_MS));
}

export function vacationPrep(opts: {
  plants: VacationPlant[];
  startsAt: Date;
  endsAt: Date;
  hasSitter: boolean;
  hemisphere?: Hemisphere;
}): PrepItem[] {
  const days = tripDays(opts.startsAt, opts.endsAt);
  const items: PrepItem[] = [];
  const add = (key: string, plantId: string | null, when: PrepWhen, text: string) => items.push({ key, plantId, when, text });

  if (opts.hasSitter) {
    add("sitter-walkthrough", null, "week_before", "Send your plant-sitter their link and show them where each plant is. The app tells them how much water and when.");
  }
  if (days > 7) add("no-feeding", null, "week_before", "Skip fertilizer for the 2 weeks before you leave, so plants grow slower and need less water.");

  for (const p of opts.plants) {
    const sunny = lightFactor(p.windowDirection, opts.hemisphere) < 0.95;
    if (p.inRescue && !opts.hasSitter) {
      add(`rescue-${p.id}`, p.id, "week_before", `${p.nickname} is being rescued and needs checks every few days. Ask a plant-sitter if you can.`);
    }
    if (opts.hasSitter) continue; // the sitter waters on schedule

    if (days <= p.intervalDays) {
      add(`water-${p.id}`, p.id, "day_before", `Water ${p.nickname} as usual the day before you leave. That's enough for this trip.`);
      continue;
    }
    add(
      `deep-water-${p.id}`,
      p.id,
      "day_before",
      `Water ${p.nickname} deeply the day before: slowly until it drains, then empty the saucer after 30 minutes.`,
    );
    if (sunny) add(`shade-${p.id}`, p.id, "leaving", `Move ${p.nickname} 1–2 m back from the window so it drinks less while you're away.`);
    if (p.potMaterial === "terracotta") {
      add(`terracotta-${p.id}`, p.id, "leaving", `Stand ${p.nickname}'s clay pot on a tray of wet pebbles; terracotta dries out fast.`);
    }
    if (days > 2 * p.intervalDays) {
      add(
        `wick-${p.id}`,
        p.id,
        "week_before",
        `Set up a wick waterer for ${p.nickname} (a cotton cord from a jar of water into the soil) and test it for a few days before you go.`,
      );
    }
  }

  if (!opts.hasSitter && days > 3 && opts.plants.length > 1) {
    add("group", null, "leaving", "Group your plants together out of direct sun. They keep each other humid.");
  }
  add("return", null, "return", "Check each plant's soil before watering, and answer the first reminder in the app so the schedule picks up again.");
  return items;
}

export type VacationStatus = "upcoming" | "active" | "past";
export function vacationStatus(startsAt: Date, endsAt: Date, now: Date): VacationStatus {
  if (now < startsAt) return "upcoming";
  if (now > endsAt) return "past";
  return "active";
}
