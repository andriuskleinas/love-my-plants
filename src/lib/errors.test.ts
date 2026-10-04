import { describe, expect, it } from "vitest";
import { describeError } from "./api-client";
import { formatRetry, inAbout, MESSAGES, nextUtcMidnight } from "./errors";

describe("retry times", () => {
  const now = new Date("2026-10-04T12:00:00Z");
  it("says when, in plain words", () => {
    expect(inAbout(30_000)).toBe("in 1 minute");
    expect(inAbout(45 * 60_000)).toBe("in 45 minutes");
    expect(inAbout(9 * 3600_000)).toBe("in about 9 hours");
    expect(formatRetry(new Date("2026-10-04T13:00:00Z"), now, "Europe/Vilnius")).toBe("16:00 (in about 1 hour)");
  });

  it("resets daily limits at midnight UTC", () => {
    expect(nextUtcMidnight(now).toISOString()).toBe("2026-10-05T00:00:00.000Z");
  });
});

describe("API error wording", () => {
  it("adds the retry time to limit messages", () => {
    const retryAt = new Date(Date.now() + 3 * 3600_000).toISOString();
    const msg = describeError(429, { error: "You've used all 20 plant checks for today.", retryAt });
    expect(msg).toMatch(/^You've used all 20 plant checks for today\. You can try again from \d\d:\d\d \(in about 3 hours\)\.$/);
  });

  it("explains failures that have no server message", () => {
    expect(describeError(401, { error: "x" })).toBe(MESSAGES.signedOut);
    expect(describeError(504, null)).toBe(MESSAGES.timeout);
    expect(describeError(503, null)).toBe(MESSAGES.unavailable);
    expect(describeError(500, null)).toBe(MESSAGES.server);
    expect(describeError(400, null)).toBe(MESSAGES.badRequest);
  });

  it("keeps the server's explanation otherwise", () => {
    expect(describeError(403, { error: "Only household members can delete plants." })).toBe("Only household members can delete plants.");
  });
});
