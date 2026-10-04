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
    return new AssessmentError(error.message, `${what} couldn't run right now. Please try again in a minute or two.`, 503);
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AssessmentError(error.message, `${what} took too long and nothing was saved. Please try again.`, 503);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AssessmentError(error.message, `${what} couldn't start. Please try again in a minute.`, 503);
  }
  if (error instanceof Anthropic.InternalServerError) {
    // 500/529: the AI service is overloaded or having an outage.
    return new AssessmentError(`API ${error.status}: ${error.message}`, `${what} isn't available right now. Please try again in a few minutes.`, 503);
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError || isBillingError(error)) {
    return new AssessmentError(
      `API ${(error as InstanceType<typeof Anthropic.APIError>).status}: ${(error as Error).message}`,
      `${what} is unavailable right now. Please try again later.`,
    );
  }
  if (error instanceof Anthropic.APIError) {
    return new AssessmentError(`API ${error.status}: ${error.message}`, `${what} failed. Please try again.`);
  }
  return new AssessmentError(String(error), `${what} failed. Please try again.`);
}

function isBillingError(error: unknown): boolean {
  return error instanceof Anthropic.BadRequestError && /credit balance|billing/i.test(error.message);
}

export const REFUSAL_CHECK =
  "These photos couldn't be analysed. Take a clear, well-lit photo of just the plant and try again.";
export const INCOMPLETE_CHECK =
  "The check didn't finish and nothing was saved. Please try again.";
