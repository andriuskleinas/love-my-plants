import { describe, expect, it } from "vitest";
import { decodeWaterAnswer, encodeWaterAnswer, waterAnswerSummary, waterReminderMessage } from "./reminders";
import { formatLinkCode, normalizeLinkCode } from "./link-code";
import { escapeHtml } from "./types";

const taskId = "3f8a1c2e-1234-4abc-9def-0123456789ab";

describe("water reminder buttons", () => {
  it("round-trips every answer and fits Telegram's 64-byte limit", () => {
    for (const outcome of ["dry", "damp", "dry_drooping", "snooze"] as const) {
      const data = encodeWaterAnswer(taskId, outcome);
      expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64);
      expect(decodeWaterAnswer(data)).toEqual({ taskId, outcome });
    }
  });

  it("rejects anything else", () => {
    expect(decodeWaterAnswer("w:not-a-task:d")).toBeNull();
    expect(decodeWaterAnswer(`w:${taskId}:z`)).toBeNull();
    expect(decodeWaterAnswer(`x:${taskId}:d`)).toBeNull();
  });

  it("builds a reminder with four answers and escapes the plant name", () => {
    const msg = waterReminderMessage({ taskId, nickname: "Fern <3 & co", amount: "150 ml" });
    expect(msg.html).toContain("Fern &lt;3 &amp; co");
    expect(msg.html).toContain("150 ml");
    expect(msg.buttons.flat()).toHaveLength(4);
  });

  it("summarises each answer", () => {
    expect(waterAnswerSummary("Monty", "dry", "in 5 days")).toBe("✅ <b>Monty</b> watered. Next watering: in 5 days.");
    expect(waterAnswerSummary("Monty", "damp", "in 2 days")).toContain("still damp");
    expect(waterAnswerSummary("Monty", "snooze", "tomorrow")).toBe("⏰ <b>Monty</b>: we'll remind you tomorrow.");
  });

  it("escapes HTML", () => {
    expect(escapeHtml("<b>&</b>")).toBe("&lt;b&gt;&amp;&lt;/b&gt;");
  });
});

describe("connect codes", () => {
  it("accepts codes however they're typed", () => {
    expect(normalizeLinkCode("K7MP-3XQ2")).toBe("K7MP3XQ2");
    expect(normalizeLinkCode(" k7mp 3xq2 ")).toBe("K7MP3XQ2");
    expect(formatLinkCode("K7MP3XQ2")).toBe("K7MP-3XQ2");
  });

  it("rejects ordinary messages and look-alike characters", () => {
    expect(normalizeLinkCode("hello there")).toBeNull();
    expect(normalizeLinkCode("why are my leaves yellow")).toBeNull();
    expect(normalizeLinkCode("K7MP-3XQO")).toBeNull(); // letter O isn't used
    expect(normalizeLinkCode("/today")).toBeNull();
  });
});
