// Structured AI outputs (plan §5). Claude returns these via tool use; we validate before saving.
import { z } from "zod";

export const SCORE_KEYS = [
  "health",
  "leaves",
  "pests",
  "hydration",
  "soil",
  "light",
  "pot",
  "growth",
] as const;
export type ScoreKey = (typeof SCORE_KEYS)[number];

export const SCORE_LABELS: Record<ScoreKey, string> = {
  health: "Overall health",
  leaves: "Leaves & illness",
  pests: "Pests",
  hydration: "Hydration",
  soil: "Soil",
  light: "Light",
  pot: "Pot fit",
  growth: "Growth vigor",
};

/** Below this confidence an issue is shown as "possible", never as a fact. */
export const LOW_CONFIDENCE = 0.6;

const confidence = z.number().min(0).max(1);

export const scoreSchema = z.object({
  value: z.number().int().min(0).max(100),
  why: z.string().min(1).max(200),
  confidence,
});

export const issueSchema = z.object({
  title: z.string().min(1),
  detail: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  confidence,
});

export const actionSchema = z.object({
  step: z.string().min(1).max(200),
  why: z.string().max(300),
  taskType: z.enum(["water", "light", "prune", "repot", "fertilize", "pests", "clean", "rotate", "mist", "other"]),
});

export const rescueStepSchema = z.object({
  day: z.number().int().min(1).max(30),
  step: z.string().min(1),
});

export const assessmentSchema = z.object({
  photoQuality: z.object({
    ok: z.boolean(),
    retakeHint: z.string().nullable(),
  }),
  species: z
    .array(z.object({ name: z.string(), commonName: z.string(), confidence }))
    .max(3),
  scores: z.object(Object.fromEntries(SCORE_KEYS.map((k) => [k, scoreSchema])) as Record<ScoreKey, typeof scoreSchema>),
  issues: z.array(issueSchema).max(8),
  actions: z.array(actionSchema).max(3),
  estimatedHeightCm: z.number().positive().nullable(),
  repotSignals: z.object({
    rootsVisible: z.boolean(),
    drainsTooFast: z.boolean(),
  }),
  suggestedNickname: z.string().max(40).nullable(),
  rescuePlan: z
    .object({
      diagnosis: z.array(z.object({ cause: z.string(), confidence })),
      steps: z.array(rescueStepSchema).min(1).max(20),
    })
    .nullable(),
});
export type Assessment = z.infer<typeof assessmentSchema>;

export const shopVerdictSchema = z.object({
  product: z.string(),
  verdict: z.enum(["good", "tweak", "skip"]),
  reason: z.string().max(400),
  alternative: z.string().max(300).nullable(),
});
export type ShopVerdict = z.infer<typeof shopVerdictSchema>;

/** Plant ER triggers (plan F7). */
export function needsEmergency(current: number, previous?: number | null): boolean {
  if (current < 40) return true;
  return previous != null && previous - current > 20;
}
