import { describe, expect, it } from "vitest";
import { legacyKind, parseAssessment, shortTitle } from "../ai/schemas";
import { showTip, tipAnswerText, type TipAnswer } from "./tips";

const DAY = 86_400_000;
const now = new Date("2026-11-01T12:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * DAY);
const tip = { assessmentId: "a2", index: 0, topic: "light" as const };
const answer = (over: Partial<TipAnswer>): TipAnswer => ({
  assessmentId: "a1",
  index: 0,
  topic: "light",
  answer: "done",
  note: null,
  answeredAt: ago(1),
  ...over,
});

describe("showTip", () => {
  it("shows a tip nobody answered", () => {
    expect(showTip(tip, [], { light: 40 }, now)).toBe(true);
  });

  it("hides a tip answered done or can't", () => {
    expect(showTip(tip, [answer({ assessmentId: "a2", answer: "done" })], {}, now)).toBe(false);
    expect(showTip(tip, [answer({ assessmentId: "a2", answer: "cant" })], {}, now)).toBe(false);
  });

  it("hides a tip put off for a week", () => {
    expect(showTip(tip, [answer({ assessmentId: "a2", answer: "later", answeredAt: ago(3) })], {}, now)).toBe(false);
    expect(showTip(tip, [answer({ assessmentId: "a2", answer: "later", answeredAt: ago(8) })], {}, now)).toBe(true);
  });

  it("keeps the same topic quiet for 4 weeks after done, even from a newer check", () => {
    expect(showTip(tip, [answer({ answeredAt: ago(10) })], { light: 30 }, now)).toBe(false);
    expect(showTip(tip, [answer({ answeredAt: ago(27) })], { light: 30 }, now)).toBe(false);
  });

  it("after 4 weeks, brings it back only if the photos still show the problem", () => {
    expect(showTip(tip, [answer({ answeredAt: ago(30) })], { light: 45 }, now)).toBe(true);
    expect(showTip(tip, [answer({ answeredAt: ago(30) })], { light: 75 }, now)).toBe(false);
  });

  it("other topics and 'later' answers don't quiet other tips", () => {
    expect(showTip(tip, [answer({ topic: "repot" })], {}, now)).toBe(true);
    expect(showTip(tip, [answer({ answer: "later" })], {}, now)).toBe(true);
    expect(showTip({ ...tip, topic: "other" }, [answer({ topic: "other" })], {}, now)).toBe(true);
  });

  it("topics without a score come back after 4 weeks", () => {
    expect(showTip({ ...tip, topic: "mist" }, [answer({ topic: "mist", answeredAt: ago(30) })], {}, now)).toBe(true);
  });
});

it("tipAnswerText", () => {
  expect(tipAnswerText({ ...answer({ note: 'the "sunniest" spot ' }), title: "Move closer to the window" })).toBe(
    "2026-10-31 light tip 'Move closer to the window': done — \"the 'sunniest' spot\"",
  );
  expect(tipAnswerText({ ...answer({ answer: "cant" }), title: "Repot" })).toBe("2026-10-31 light tip 'Repot': can't do it");
});

describe("older checks", () => {
  it("sorts advice into to-dos and tips", () => {
    expect(legacyKind({ step: "Move the plant to within 1 m of the window", taskType: "light" })).toBe("tip");
    expect(legacyKind({ step: "No more water for now. When convenient, repot it", taskType: "other" })).toBe("tip");
    expect(legacyKind({ step: "Wipe the leaves with a damp cloth", taskType: "clean" })).toBe("todo");
    expect(legacyKind({ step: "Don’t fertilise this winter; wait until spring", taskType: "fertilize" })).toBe("tip");
  });

  it("makes a short title from the step", () => {
    expect(shortTitle("Wipe the leaves with a damp cloth.")).toBe("Wipe the leaves with a damp cloth");
    expect(shortTitle("Move the plant to within 1 m of the south-west window, where it gets bright light")).toBe(
      "Move the plant to within 1 m of the…",
    );
    expect(shortTitle("No more water for now — we'll remind you when it's time.")).toBe("No more water for now");
    expect(shortTitle("Mist")).toBe("Mist");
  });

  it("parseAssessment fills in kind and title", () => {
    const score = { value: 70, why: "ok", confidence: 0.9 };
    const raw = {
      photoQuality: { ok: true, retakeHint: null },
      species: [],
      scores: Object.fromEntries(["health", "leaves", "pests", "hydration", "soil", "light", "pot", "growth"].map((k) => [k, score])),
      issues: [],
      actions: [{ step: "Move it closer to the window.", why: "Pale leaves", taskType: "light" }],
      estimatedHeightCm: null,
      repotSignals: { rootsVisible: false, drainsTooFast: false },
      suggestedNickname: null,
      careProfile: {
        baseWaterIntervalDays: 7,
        repotIntervalMonths: 24,
        light: "",
        humidity: "",
        temperature: "",
        fertilizer: "",
        soilMix: "",
        toxicToPets: null,
      },
      rescuePlan: null,
    };
    expect(parseAssessment(raw)?.actions[0]).toMatchObject({ kind: "tip", title: "Move it closer to the window" });
    expect(parseAssessment({ nope: true })).toBeUndefined();
  });
});
