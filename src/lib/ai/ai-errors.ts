import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/** An AI call failed; `userMessage` says what happened, why, and what to do. */
export class AssessmentError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
    /** HTTP status to send the app: 503 for "try again shortly", 502 for other AI failures. */
    readonly status = 502,
  ) {
    super(message);
  }
}

/** Turns an Anthropic SDK error into a clear message for a photo check ("check") or a chat reply ("chat"). */
export function aiFailure(error: unknown, kind: "check" | "chat"): AssessmentError {
  const what = kind === "check" ? "The plant check" : "Plant Buddy";
  if (error instanceof Anthropic.RateLimitError) {
    return new AssessmentError(error.message, `${what} couldn't run because our AI service is getting too many requests right now. Please try again in a minute or two.`, 503);
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AssessmentError(error.message, `${what} took too long and timed out, so nothing was saved. Please try again.`, 503);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AssessmentError(error.message, `${what} couldn't reach our AI service (a connection problem on our side). Please try again in a minute.`, 503);
  }
  if (error instanceof Anthropic.InternalServerError) {
    // 500/529: the AI service is overloaded or having an outage.
    return new AssessmentError(`API ${error.status}: ${error.message}`, `Our AI service is overloaded or having problems right now, so ${what.toLowerCase()} couldn't run. Please try again in a few minutes.`, 503);
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError || isBillingError(error)) {
    return new AssessmentError(
      `API ${(error as InstanceType<typeof Anthropic.APIError>).status}: ${(error as Error).message}`,
      `${what} is unavailable because of a problem with the app's AI account (not something you did). Please try again later.`,
    );
  }
  if (error instanceof Anthropic.APIError) {
    return new AssessmentError(`API ${error.status}: ${error.message}`, `${what} failed because of an unexpected AI service error. Please try again.`);
  }
  return new AssessmentError(String(error), `${what} failed unexpectedly. Please try again.`);
}

function isBillingError(error: unknown): boolean {
  return error instanceof Anthropic.BadRequestError && /credit balance|billing/i.test(error.message);
}

export const REFUSAL_CHECK =
  "The AI declined to analyse these photos (its safety filter was triggered). This sometimes happens with unclear images. Try a clear, well-lit photo of just the plant.";
export const INCOMPLETE_CHECK =
  "The check didn't finish properly, so no results were saved. Please try again; it usually works on the second try.";
