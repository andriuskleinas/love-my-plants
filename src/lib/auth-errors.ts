// Sign-in failures: what happened, and what to do.
import { formatRetry, MESSAGES } from "./errors";

export function signInErrorMessage(
  error: { code?: string; status?: number; message?: string },
  now = new Date(),
  online = typeof navigator === "undefined" ? true : navigator.onLine,
): string {
  const message = error.message ?? "";
  if (!online || /fetch|network/i.test(message)) return MESSAGES.offline;

  if (error.code === "invalid_credentials" || /invalid login credentials/i.test(message)) {
    return "The email or password is wrong. Check both and try again, or reset your password.";
  }
  if (error.code === "user_already_exists" || error.code === "email_exists" || /already registered/i.test(message)) {
    return "There's already an account with this email. Sign in instead.";
  }
  if (error.code === "weak_password" || /password should/i.test(message)) {
    return "This password is too short or too easy to guess. Use at least 8 characters.";
  }
  // Supabase's built-in email only reaches the project's own team.
  if (error.code === "email_address_not_authorized" || /email address not authorized/i.test(message)) {
    return "Password reset emails can't be sent to this address yet. Ask the app owner to reset your password.";
  }
  if (error.code === "over_email_send_rate_limit" || /email rate limit/i.test(message)) {
    const retryAt = new Date(now.getTime() + 60 * 60 * 1000);
    return `Too many emails were sent. Try again after ${formatRetry(retryAt, now)}, or use the newest email you already have.`;
  }
  const wait = /after (\d+) seconds?/i.exec(message)?.[1];
  if (wait) return `An email was requested too soon. Wait ${wait} seconds and try again.`;
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
  return "That didn't work. Try again in a few minutes.";
}

/** A link from an email (password reset) didn't work (reason passed back by /auth/confirm). */
export function linkErrorMessage(reason: string): string {
  switch (reason) {
    case "otp_expired":
      return "This link has expired or was already used. Use \"Forgot password?\" to get a new one.";
    case "access_denied":
      return "This link no longer works. Use \"Forgot password?\" to get a new one.";
    case "missing":
      return "This link is incomplete. Open it straight from the email, or request a new one.";
    case "pkce":
      return "This link was opened in a different browser. Open it in the browser where you requested it, or request a new one here.";
    default:
      return "This link didn't work. Use \"Forgot password?\" to get a new one.";
  }
}
