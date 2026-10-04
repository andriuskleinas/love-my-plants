// Sign-in failures in plain words: what happened, why, and what to do (and when).
import { formatRetry, MESSAGES } from "./errors";

/** Supabase's built-in email service sends at most this many sign-in emails per hour. */
export const EMAILS_PER_HOUR = 2;

export function signInErrorMessage(
  error: { code?: string; status?: number; message?: string },
  now = new Date(),
  online = typeof navigator === "undefined" ? true : navigator.onLine,
): string {
  const message = error.message ?? "";
  if (!online || /fetch|network/i.test(message)) return MESSAGES.offline;

  if (error.code === "over_email_send_rate_limit" || /email rate limit/i.test(message)) {
    const retryAt = new Date(now.getTime() + 60 * 60 * 1000);
    return (
      `Too many sign-in emails were sent: for security, only ${EMAILS_PER_HOUR} can be sent per hour. ` +
      `Please try again after ${formatRetry(retryAt, now)}, or open the newest sign-in email you already received.`
    );
  }
  const wait = /after (\d+) seconds?/i.exec(message)?.[1];
  if (wait) {
    return `For security, a new sign-in link can only be requested every minute. Please wait ${wait} seconds and try again.`;
  }
  if (error.code === "over_request_rate_limit" || error.status === 429) {
    return "Too many sign-in attempts from this device in a short time (a security limit). Please wait a few minutes and try again.";
  }
  if (error.code === "email_address_invalid" || error.code === "validation_failed" || /invalid.*email/i.test(message)) {
    return "That email address isn't valid. Please check it for typos and try again.";
  }
  if (error.code === "signup_disabled" || /signups not allowed/i.test(message)) {
    return "New accounts can't be created right now, so this email can't sign in yet. Ask the app owner to invite you.";
  }
  if ((error.status ?? 0) >= 500) {
    return "The sign-in service is having problems right now, so the email wasn't sent. Please try again in a few minutes.";
  }
  return `The sign-in email couldn't be sent${message ? ` (${message})` : ""}. Please try again in a few minutes.`;
}

/** Why a sign-in link from an email didn't work (reason passed back by /auth/confirm). */
export function linkErrorMessage(reason: string): string {
  switch (reason) {
    case "otp_expired":
      return "This sign-in link has expired or was already used. Each link works once, within 1 hour. Enter your email below to get a new one.";
    case "access_denied":
      return "This sign-in link was rejected because it's no longer valid. Enter your email below to get a new one.";
    case "missing":
      return "This sign-in link is incomplete, maybe it was cut off when copied. Open the link straight from the email, or request a new one.";
    case "pkce":
      return "This sign-in link was opened in a different browser or app than the one you requested it from. Open it on the same device and browser, or request a new one here.";
    default:
      return "This sign-in link didn't work. It may have expired or already been used. Enter your email below to get a new one.";
  }
}
