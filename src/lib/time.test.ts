import { describe, expect, it } from "vitest";
import {
  backByChoices,
  fmtDuration,
  isOverdue,
  minutesLate,
  minutesOut,
  timeInputToIso,
} from "@/lib/time";

const NOW = new Date("2026-06-10T18:00:00Z");

describe("overdue logic", () => {
  it("not overdue before the due-back time", () => {
    expect(isOverdue("2026-06-10T19:00:00Z", NOW)).toBe(false);
    expect(minutesLate("2026-06-10T19:00:00Z", NOW)).toBe(0);
  });

  it("overdue after the due-back time", () => {
    expect(isOverdue("2026-06-10T17:30:00Z", NOW)).toBe(true);
    expect(minutesLate("2026-06-10T17:30:00Z", NOW)).toBe(30);
  });

  it("an outing with no due-back time is never flagged", () => {
    expect(isOverdue(null, NOW)).toBe(false);
    expect(minutesLate(null, NOW)).toBe(0);
  });

  it("counts minutes out", () => {
    expect(minutesOut("2026-06-10T16:55:00Z", NOW)).toBe(65);
  });

  it("formats durations", () => {
    expect(fmtDuration(45)).toBe("45 min");
    expect(fmtDuration(60)).toBe("1 h");
    expect(fmtDuration(125)).toBe("2 h 5 min");
  });
});

describe("due-back choices", () => {
  it("offers relative chips anchored on now", () => {
    const chips = backByChoices(NOW);
    expect(chips[0]).toEqual({ label: "30 min", iso: "2026-06-10T18:30:00.000Z" });
    expect(chips[1].iso).toBe("2026-06-10T19:00:00.000Z");
    expect(chips[2].iso).toBe("2026-06-10T20:00:00.000Z");
  });

  it("includes a curfew chip only while it is later than the +2h chip", () => {
    const morning = new Date("2026-06-10T08:00:00");
    const chips = backByChoices(morning);
    expect(chips.length).toBe(4);
    const evening = new Date("2026-06-10T20:30:00");
    expect(backByChoices(evening).length).toBe(3);
  });
});

describe("time input parsing", () => {
  it("maps to today when still ahead", () => {
    const local = new Date("2026-06-10T10:00:00");
    const iso = timeInputToIso("12:30", local)!;
    const d = new Date(iso);
    expect(d.getHours()).toBe(12);
    expect(d.getDate()).toBe(local.getDate());
  });

  it("rolls past times to tomorrow", () => {
    const local = new Date("2026-06-10T22:00:00");
    const iso = timeInputToIso("07:30", local)!;
    expect(new Date(iso).getDate()).toBe(11);
  });

  it("rejects rubbish", () => {
    expect(timeInputToIso("7:3", NOW)).toBeNull();
    expect(timeInputToIso("", NOW)).toBeNull();
  });
});
