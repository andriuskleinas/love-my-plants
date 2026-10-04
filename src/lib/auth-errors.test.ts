import { describe, expect, it } from "vitest";
import { linkErrorMessage, signInErrorMessage } from "./auth-errors";
import { MESSAGES } from "./errors";

const now = new Date("2026-10-04T11:50:00Z");

describe("sign-in errors", () => {
  it("explains the email limit and when to try again", () => {
    const msg = signInErrorMessage({ code: "over_email_send_rate_limit", status: 429, message: "email rate limit exceeded" }, now, true);
    expect(msg).toMatch(/only 2 can be sent per hour/);
    expect(msg).toMatch(/try again after \d\d:\d\d \(in about 1 hour\)/);
  });

  it("says how long to wait between links", () => {
    const msg = signInErrorMessage({ status: 429, message: "For security purposes, you can only request this after 52 seconds." }, now, true);
    expect(msg).toBe("For security, a new sign-in link can only be requested every minute. Please wait 52 seconds and try again.");
  });

  it("handles offline, typos and outages", () => {
    expect(signInErrorMessage({ message: "Failed to fetch" }, now, true)).toBe(MESSAGES.offline);
    expect(signInErrorMessage({}, now, false)).toBe(MESSAGES.offline);
    expect(signInErrorMessage({ code: "email_address_invalid", status: 400 }, now, true)).toMatch(/isn't valid/);
    expect(signInErrorMessage({ status: 503, message: "x" }, now, true)).toMatch(/having problems right now/);
  });

  it("explains broken links", () => {
    expect(linkErrorMessage("otp_expired")).toMatch(/works once, within 1 hour/);
    expect(linkErrorMessage("pkce")).toMatch(/different browser/);
    expect(linkErrorMessage("something")).toMatch(/didn't work/);
  });
});
