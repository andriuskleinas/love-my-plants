import { describe, expect, it } from "vitest";
import { linkErrorMessage, signInErrorMessage } from "./auth-errors";
import { MESSAGES } from "./errors";

const now = new Date("2026-10-04T11:50:00Z");

describe("sign-in errors", () => {
  it("explains the email limit and when to try again", () => {
    const msg = signInErrorMessage({ code: "over_email_send_rate_limit", status: 429, message: "email rate limit exceeded" }, now, true);
    expect(msg).toMatch(/^Too many emails were sent\. Try again after \d\d:\d\d \(in about 1 hour\), or use the newest email you already have\.$/);
  });

  it("says how long to wait between emails", () => {
    const msg = signInErrorMessage({ status: 429, message: "For security purposes, you can only request this after 52 seconds." }, now, true);
    expect(msg).toBe("An email was requested too soon. Wait 52 seconds and try again.");
  });

  it("handles offline, typos and outages", () => {
    expect(signInErrorMessage({ message: "Failed to fetch" }, now, true)).toBe(MESSAGES.offline);
    expect(signInErrorMessage({}, now, false)).toBe(MESSAGES.offline);
    expect(signInErrorMessage({ code: "email_address_invalid", status: 400 }, now, true)).toMatch(/isn't valid/);
    expect(signInErrorMessage({ status: 503, message: "x" }, now, true)).toBe("Sign-in isn't working right now. Try again in a few minutes.");
  });

  it("explains passwords and accounts", () => {
    expect(signInErrorMessage({ code: "invalid_credentials", status: 400 }, now, true)).toMatch(/^The email or password is wrong\./);
    expect(signInErrorMessage({ code: "user_already_exists", status: 422 }, now, true)).toBe("There's already an account with this email. Sign in instead.");
    expect(signInErrorMessage({ code: "weak_password", status: 422 }, now, true)).toMatch(/at least 8 characters/);
    expect(signInErrorMessage({ status: 400, message: "Email address not authorized" }, now, true)).toMatch(/Ask the app owner to reset your password/);
  });

  it("explains broken links", () => {
    expect(linkErrorMessage("otp_expired")).toBe('This link has expired or was already used. Use "Forgot password?" to get a new one.');
    expect(linkErrorMessage("pkce")).toMatch(/different browser/);
    expect(linkErrorMessage("something")).toMatch(/didn't work/);
  });
});
