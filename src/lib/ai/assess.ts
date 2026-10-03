import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { daylightHours, windowDirectionName, type WindowDirection } from "../care/watering";
import { assessmentSchema, type Assessment } from "./schemas";

// Opus 5.5 by default; set ASSESS_MODEL=claude-sonnet-5-5 to trade some quality for cost.
export const ASSESS_MODEL = process.env.ASSESS_MODEL ?? "claude-opus-5-5";

const client = new Anthropic();

export type PhotoKind = "whole" | "soil" | "spot" | "triage" | "checkin";

export interface AssessPhoto {
  kind: PhotoKind;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  base64: string;
}

export interface AssessContext {
  speciesHint?: string | null;
  potDiameterCm: number;
  potMaterial: string;
  hasDrainage: boolean;
  /** The app's watering amount for this pot; the AI must use it so steps match reminders. */
  waterAmountMl: number;
  windowDirection: WindowDirection;
  hemisphere: "north" | "south";
  location?: { name: string; latitude: number } | null;
  today: Date;
  previous?: { date: string; health: number; scores: Record<string, number>; heightCm: number | null } | null;
  emergency?: boolean;
}

const PHOTO_LABELS: Record<PhotoKind, string> = {
  whole: "Whole plant",
  soil: "Soil close-up",
  spot: "Where the plant stands (window/light)",
  triage: "Problem close-up",
  checkin: "Weekly check-in",
};

// Frozen so it caches; anything per-request goes in the user message.
const SYSTEM = `You are a calm, expert house-plant doctor inside the "Love My Plants" app. People with no plant knowledge send you photos of their indoor plants. You assess the plant and return structured data that the app turns into a report card, simple care steps and reminders.

## Scores (0–100, higher is always better)
For each score give a one-line plain-language "why" the owner can verify by looking at the plant, and your confidence (0–1).
- health: overall vitality. 90+ thriving, ~70 fine with minor issues, ~50 struggling, <40 in danger.
- leaves: leaf condition and signs of illness (yellowing, browning, spots, wilting, rot). 100 = clean, firm, true-coloured leaves.
- pests: 100 = no visible pests or damage; lower for webbing, specks, sticky residue, chewed edges.
- hydration: 100 = ideal moisture for this species right now. Low for BOTH under-watering (dry, crispy, collapsed soil) and over-watering (soggy dark soil, mushy stems, yellow lower leaves) — explain which in "why".
- soil: structure and suitability (drainage, compaction, mould, salt crust, right mix for the species).
- light: whether the light level visible in the photos suits the species (stretching/pale = too little, scorched/bleached = too much).
- pot: size and type for the plant (too small/rootbound, too big, no drainage).
- growth: vigor — new growth, fullness, leggy or stalled.
If a photo needed for a score is missing (e.g. no soil close-up), estimate from what you can see and lower the confidence.

## Rules
- Be honest but kind. Never invent problems; only report issues you can see evidence of. Use confidence < 0.6 when unsure; the app shows those as "possible".
- If the photos are too blurry, dark, cropped, or don't show a plant, set photoQuality.ok=false with one specific retake hint (e.g. "Step back so the whole plant and pot are in frame"). Still fill every field with your best guess.
- species: up to 3 guesses, most likely first, with scientific and common names.
- actions: at most 3, most important first, each one short concrete step a beginner can do today with real-world units ("Water about 250 ml (one glass) slowly until it drains, then empty the saucer"). If nothing is needed today, give one reassuring action like "No water today — we'll remind you when it's time".
- Watering: whenever a step says to water, use exactly the amount given in the request. Never promise a number of days until the next watering; the app's reminders handle timing and learn from the owner's feedback.
- estimatedHeightCm: estimate plant height above the soil, using the pot diameter given as scale. null if impossible.
- repotSignals: rootsVisible only if roots are visible at the drainage holes or soil surface; drainsTooFast only if there is visible evidence.
- careProfile: typical care for this species indoors. baseWaterIntervalDays is the typical days between waterings in spring for a 15 cm plastic pot with drainage in an east window (the app adjusts for season, pot and light itself).
- suggestedNickname: a short, friendly, slightly playful name based on the species.
- rescuePlan: null unless the request says this is an emergency check. For emergencies give ranked likely causes and a day-by-day plan (7–14 days) with photo check-ins.
- Pets: if the species is toxic, mention it in the care profile; be conservative with any pesticide advice and prefer non-chemical options first.`;

export class AssessmentError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
  ) {
    super(message);
  }
}

function contextText(ctx: AssessContext): string {
  const lines = [
    `Date: ${ctx.today.toISOString().slice(0, 10)} (${ctx.hemisphere}ern hemisphere)`,
    ...(ctx.location
      ? [
          `Location: ${ctx.location.name} (latitude ${ctx.location.latitude.toFixed(1)}); about ${daylightHours(ctx.location.latitude, ctx.today).toFixed(1)} h of daylight today`,
        ]
      : []),
    `Pot: ${ctx.potDiameterCm} cm diameter, ${ctx.potMaterial}, ${ctx.hasDrainage ? "has" : "NO"} drainage hole`,
    `Watering amount for this pot: about ${ctx.waterAmountMl} ml`,
    `Window: ${ctx.windowDirection === "none" ? "not near a window" : `${windowDirectionName(ctx.windowDirection)}-facing window`}`,
  ];
  if (ctx.speciesHint) lines.push(`Owner says the species is: ${ctx.speciesHint}`);
  if (ctx.previous) {
    lines.push(
      `Previous check (${ctx.previous.date}): health ${ctx.previous.health}, scores ${JSON.stringify(ctx.previous.scores)}, height ${ctx.previous.heightCm ?? "unknown"} cm. Keep scores consistent with this unless the photos show real change.`,
    );
  }
  lines.push(ctx.emergency ? "This is an EMERGENCY check: include a rescuePlan." : "Routine check: rescuePlan must be null.");
  return lines.join("\n");
}

export async function assessPlant(photos: AssessPhoto[], ctx: AssessContext): Promise<Assessment> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  photos.forEach((p, i) => {
    content.push({ type: "text", text: `Photo ${i + 1}: ${PHOTO_LABELS[p.kind]}` });
    content.push({ type: "image", source: { type: "base64", media_type: p.mediaType, data: p.base64 } });
  });
  content.push({ type: "text", text: contextText(ctx) });

  let response;
  try {
    response = await client.beta.messages.parse({
      model: ASSESS_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(assessmentSchema) },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content }],
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new AssessmentError(error.message, "Our plant doctor is busy. Please try again in a minute.");
    }
    if (error instanceof Anthropic.APIError) {
      throw new AssessmentError(`API ${error.status}: ${error.message}`, "We couldn't check your plant right now. Please try again.");
    }
    throw error;
  }

  if (response.stop_reason === "refusal") {
    throw new AssessmentError("refusal", "We couldn't analyse these photos. Try a clear photo of just the plant.");
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new AssessmentError(`unparsed output (${response.stop_reason})`, "Something went wrong reading the results. Please try again.");
  }
  return response.parsed_output;
}
