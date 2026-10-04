// Sign-in failures: what happened, and what to do.
import { formatRetry, MESSAGES } from "./errors";

export function signInErrorMessage(
  error: { code?: string; status?: number; message?: string },
  now = new Date(),
  online = typeof navigator === "undefined" ? true : navigator.onLine,
): string {
  const message = error.message ?? "";
  if (!online || /fetch|network/i.test(message)) return MESSAGES.offline;

  if (error.code === "over_email_send_rate_limit" || /email rate limit/i.test(message)) {
    const retryAt = new Date(now.getTime() + 60 * 60 * 1000);
    return `Too many sign-in emails were sent. Try again after ${formatRetry(retryAt, now)}, or open the newest sign-in email you already have.`;
  }
  const wait = /after (\d+) seconds?/i.exec(message)?.[1];
  if (wait) return `A new link was requested too soon. Wait ${wait} seconds and try again.`;
  if (error.code === "over_request_rate_limit" || error.status === 429) {
    return "Too many sign-in attempts. Wait a few minutes and try again.";
  }
  if (error.code === "email_address_invalid" || error.code === "validation_failed" || /invalid.*email/i.test(message)) {
    return "This email address isn't valid. Check it for typos and try again.";
  }
  if (error.code === "signup_disabled" || /signups not allowed/i.test(message)) {
    return "New accounts can't be created right now. Ask the app owner to invite you.";
  }
  if ((error.status ?? 0) >= 500) return "Sign-in isn't working right now. Try again in a few minutes.";
  return "The sign-in email wasn't sent. Try again in a few minutes.";
}

/** A sign-in link from an email didn't work (reason passed back by /auth/confirm). */
export function linkErrorMessage(reason: string): string {
  switch (reason) {
    case "otp_expired":
      return "This sign-in link has expired or was already used. Enter your email to get a new one.";
    case "access_denied":
      return "This sign-in link no longer works. Enter your email to get a new one.";
    case "missing":
      return "This sign-in link is incomplete. Open it straight from the email, or request a new one.";
    case "pkce":
      return "This sign-in link was opened in a different browser. Open it in the browser where you requested it, or request a new one here.";
    default:
      return "This sign-in link didn't work. Enter your email to get a new one.";
  }
}
