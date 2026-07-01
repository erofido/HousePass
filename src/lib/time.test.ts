import { describe, expect, it } from "vitest";
import {
  addDays,
  computeStreak,
  daysBetween,
  fmtDuration,
  grindDaysLeft,
  isVacationDay,
  localDateISO,
  localHour,
} from "@/lib/time";

describe("local date/hour", () => {
  it("formats the local calendar date for a timezone", () => {
    // 23:30 UTC on 1 Jul is already 2 Jul in Istanbul, still 1 Jul in London (BST 00:30 → 2 Jul actually!)
    const d = new Date("2026-07-01T22:30:00Z");
    expect(localDateISO("Europe/London", d)).toBe("2026-07-01"); // 23:30 BST
    expect(localDateISO("Europe/Istanbul", d)).toBe("2026-07-02"); // 01:30
  });

  it("gives the local hour", () => {
    const d = new Date("2026-07-01T12:00:00Z");
    expect(localHour("Europe/London", d)).toBe(13); // BST
  });
});

describe("date arithmetic", () => {
  it("adds days across month ends", () => {
    expect(addDays("2026-06-28", 5)).toBe("2026-07-03");
    expect(addDays("2026-07-01", -1)).toBe("2026-06-30");
  });

  it("computes day distance", () => {
    expect(daysBetween("2026-07-01", "2026-09-07")).toBe(68);
    expect(daysBetween("2026-09-03", "2026-09-07")).toBe(4);
  });
});

describe("vacations and grind days", () => {
  const vac = [{ start: "2026-07-20", end: "2026-08-02", label: "Holiday" }];

  it("detects vacation days inclusively", () => {
    expect(isVacationDay("2026-07-20", vac)).toBe(true);
    expect(isVacationDay("2026-08-02", vac)).toBe(true);
    expect(isVacationDay("2026-08-03", vac)).toBe(false);
  });

  it("excludes vacation days from the grind count", () => {
    // 1 Jul → 7 Sep is 68 days, minus 14 vacation days
    expect(grindDaysLeft("2026-07-01", "2026-09-07", vac)).toBe(54);
    expect(grindDaysLeft("2026-09-07", "2026-09-07", vac)).toBe(0);
  });
});

describe("streak", () => {
  const goal = 210;

  it("counts consecutive goal-met days ending today", () => {
    const m = { "2026-07-01": 220, "2026-06-30": 240, "2026-06-29": 210 };
    expect(computeStreak(m, goal, "2026-07-01", [])).toBe(3);
  });

  it("does not break the streak when today is still in progress", () => {
    const m = { "2026-07-01": 50, "2026-06-30": 240, "2026-06-29": 210 };
    expect(computeStreak(m, goal, "2026-07-01", [])).toBe(2);
  });

  it("breaks on a missed day", () => {
    const m = { "2026-07-01": 220, "2026-06-30": 0, "2026-06-29": 400 };
    expect(computeStreak(m, goal, "2026-07-01", [])).toBe(1);
  });

  it("skips vacation days instead of breaking", () => {
    const vac = [{ start: "2026-06-28", end: "2026-06-30" }];
    const m = { "2026-07-01": 220, "2026-06-27": 300, "2026-06-26": 210 };
    expect(computeStreak(m, goal, "2026-07-01", vac)).toBe(3);
  });
});

describe("fmtDuration", () => {
  it("formats minutes and hours", () => {
    expect(fmtDuration(45)).toBe("45m");
    expect(fmtDuration(60)).toBe("1h");
    expect(fmtDuration(215)).toBe("3h 35m");
  });
});
