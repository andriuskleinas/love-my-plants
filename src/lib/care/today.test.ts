import { describe, expect, it } from "vitest";
import { comingUp, dayLabel, daysAhead, greeting, longDate, orderTasks, type TodayTask } from "./today";

const TZ = "Europe/Vilnius";
// Sunday 4 October 2026, 18:30 in Vilnius (UTC+3).
const now = new Date("2026-10-04T15:30:00Z");

const base = { plantId: "p", nickname: "Sunny", photoUrl: null };
const water = (key: string, dueAt: string, overdue: boolean): TodayTask => ({
  ...base, kind: "water", key, taskId: key, title: "Water", detail: null, dueAt, overdue,
});

describe("today briefing", () => {
  it("orders tasks by urgency", () => {
    const tasks: TodayTask[] = [
      { ...base, kind: "step", key: "s", assessmentId: "a", index: 0, step: "Wipe leaves", why: "" },
      water("today", "2026-10-04T18:00:00Z", false),
      { ...base, kind: "checkin", key: "c" },
      water("late", "2026-10-02T06:00:00Z", true),
      { ...base, kind: "rescue", key: "r", text: "Rescue day 2" },
    ];
    expect(orderTasks(tasks).map((t) => t.key)).toEqual(["r", "late", "today", "c", "s"]);
  });

  it("greets by the user's local time and first name", () => {
    expect(greeting(TZ, now, "Andrius Kleinas")).toBe("Good evening, Andrius");
    expect(greeting(TZ, new Date("2026-10-04T06:00:00Z"), null)).toBe("Good morning");
    expect(greeting(TZ, new Date("2026-10-04T23:30:00Z"), "Ana")).toBe("Hello, Ana");
    expect(longDate(TZ, now)).toBe("Sunday 4 October");
  });

  it("labels days in the user's time zone", () => {
    // 22:30 UTC on the 4th is already the 5th in Vilnius.
    expect(daysAhead(TZ, now, new Date("2026-10-04T22:30:00Z"))).toBe(1);
    expect(dayLabel(TZ, now, new Date("2026-10-05T09:00:00Z"))).toBe("Tomorrow");
    expect(dayLabel(TZ, now, new Date("2026-10-06T09:00:00Z"))).toBe("Tuesday");
    expect(dayLabel(TZ, now, new Date("2026-10-13T09:00:00Z"))).toBe("Tue 13 Oct");
  });

  it("lists the week ahead, soonest first, leaving today to the to-do list", () => {
    const items = comingUp(
      {
        water: [
          { plantId: "a", nickname: "Sunny", dueAt: "2026-10-07T06:00:00Z" },
          { plantId: "b", nickname: "Fern", dueAt: "2026-10-04T19:00:00Z" }, // today: on the to-do list
          { plantId: "c", nickname: "Cactus", dueAt: "2026-10-20T06:00:00Z" }, // too far ahead
        ],
        lastPhotos: [{ plantId: "a", nickname: "Sunny", takenAt: "2026-09-29T10:00:00Z" }], // check-in due 6 Oct
        repots: [{ plantId: "a", nickname: "Sunny", targetDate: "2026-10-09" }],
        trip: { startsAt: "2026-10-10T00:00:00Z" },
      },
      TZ,
      now,
    );
    expect(items.map((i) => i.text)).toEqual([
      "Weekly check-in for Sunny",
      "Water Sunny",
      "Time to repot Sunny",
      "Your trip starts",
    ]);
  });
});
