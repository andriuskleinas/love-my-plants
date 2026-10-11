// Care the owner logs by hand ("I watered it", "I fed it"), and how care history reads.

export const LOG_TYPES = ["water", "fertilize", "prune", "repot", "mist", "rotate", "clean", "pests", "other"] as const;
export type LogType = (typeof LOG_TYPES)[number];

/** Every care_events type, including ones only the AI's steps use. */
export type CareType = LogType | "light" | "vacation_prep" | "rescue";

export const CARE_LABELS: Record<CareType, { emoji: string; label: string }> = {
  water: { emoji: "💧", label: "Watered" },
  fertilize: { emoji: "🌱", label: "Fed" },
  prune: { emoji: "✂️", label: "Pruned" },
  repot: { emoji: "🪴", label: "Repotted" },
  mist: { emoji: "💦", label: "Misted" },
  rotate: { emoji: "🔄", label: "Turned" },
  clean: { emoji: "🧽", label: "Cleaned leaves" },
  pests: { emoji: "🐛", label: "Treated pests" },
  other: { emoji: "✏️", label: "Something else" },
  light: { emoji: "☀️", label: "Moved for light" },
  vacation_prep: { emoji: "🧳", label: "Got ready for a trip" },
  rescue: { emoji: "🚨", label: "Rescue step" },
};

export const NOTE_MAX = 200;

const SOIL_TEXT: Record<string, string> = {
  dry: "soil was dry",
  dry_drooping: "bone dry & droopy",
  damp: "soil still damp",
};

export interface CareEventLike {
  type: string;
  note: string | null;
  soil_feedback: string | null;
}

/** "Watered · soil was dry", "Pruned · took off 2 yellow leaves", or just the note when it says it all. */
export function careEventText(event: CareEventLike): string {
  const known = CARE_LABELS[event.type as CareType];
  const label = known?.label ?? "Care";
  const note = event.note?.trim();
  const extra = note || (event.soil_feedback ? SOIL_TEXT[event.soil_feedback] : null);
  if (!extra) return event.type === "other" ? "Other care" : label;
  if (event.type === "other" || extra.toLowerCase().startsWith(label.toLowerCase())) return extra;
  return `${label} · ${extra}`;
}

export function careEmoji(type: string): string {
  return CARE_LABELS[type as CareType]?.emoji ?? "🌿";
}

/** Recent care as plain lines for the AI ("2026-10-11: Watered · soil was dry"), newest first. */
export function careLogText(events: (CareEventLike & { done_at: string })[], max = 10): string[] {
  return [...events]
    .sort((a, b) => b.done_at.localeCompare(a.done_at))
    .slice(0, max)
    .map((e) => `${e.done_at.slice(0, 10)}: ${careEventText(e).replace(/"/g, "'")}`);
}

/** Feeding about once a month in season: when the next one is due after the last. */
export const FEED_EVERY_DAYS = 30;
