// When the AI's tips (one-off changes like "Move closer to the window") show on Today.

import type { ScoreKey, TaskType } from "../ai/schemas";

const DAY_MS = 24 * 60 * 60 * 1000;
/** After "Done" or "Can't do this", tips on the same topic stay away this long. */
export const TIP_QUIET_DAYS = 28;
/** "Later" hides that one tip this long (or until a new check suggests it again). */
export const TIP_LATER_DAYS = 7;
/** After the quiet weeks, a tip on these topics comes back only if this score is still low. */
const TOPIC_SCORE: Partial<Record<TaskType, ScoreKey>> = { light: "light", repot: "pot", pests: "pests" };
const STILL_A_PROBLEM = 60;

export const TIP_ANSWERS = ["done", "cant", "later"] as const;
export type TipAnswerKind = (typeof TIP_ANSWERS)[number];
export const TIP_NOTE_MAX = 300;

export type TipAnswer = {
  assessmentId: string;
  index: number;
  topic: string;
  answer: TipAnswerKind;
  note: string | null;
  answeredAt: Date;
};

/**
 * Whether a tip from a plant's latest check should show. `answers` are that plant's answers;
 * `scores` are the latest check's score values.
 */
export function showTip(
  tip: { assessmentId: string; index: number; topic: TaskType },
  answers: TipAnswer[],
  scores: Partial<Record<ScoreKey, number>>,
  now: Date,
): boolean {
  const own = answers.find((a) => a.assessmentId === tip.assessmentId && a.index === tip.index);
  if (own) return own.answer === "later" && now.getTime() - own.answeredAt.getTime() >= TIP_LATER_DAYS * DAY_MS;

  if (tip.topic === "other") return true;
  const settled = answers
    .filter((a) => a.topic === tip.topic && a.answer !== "later")
    .sort((a, b) => b.answeredAt.getTime() - a.answeredAt.getTime())[0];
  if (!settled) return true;
  if (now.getTime() - settled.answeredAt.getTime() < TIP_QUIET_DAYS * DAY_MS) return false;
  const key = TOPIC_SCORE[tip.topic];
  const score = key ? scores[key] : undefined;
  return score === undefined || score < STILL_A_PROBLEM;
}

const ANSWER_WORDS: Record<TipAnswerKind, string> = { done: "done", cant: "can't do it", later: "later" };

/** For the AI: "2026-11-01 light tip 'Move closer to the window': done — this is the sunniest spot". */
export function tipAnswerText(a: TipAnswer & { title: string }): string {
  const note = a.note?.trim() ? ` — "${a.note.trim().replace(/"/g, "'")}"` : "";
  return `${a.answeredAt.toISOString().slice(0, 10)} ${a.topic} tip '${a.title}': ${ANSWER_WORDS[a.answer]}${note}`;
}
