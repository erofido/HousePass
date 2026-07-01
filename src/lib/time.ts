/** Date/streak arithmetic. All "days" are local-date strings (YYYY-MM-DD). */

export interface VacationRange {
  start: string; // YYYY-MM-DD, inclusive
  end: string; // YYYY-MM-DD, inclusive
  label?: string;
}

/** Local calendar date in the given IANA timezone. */
export function localDateISO(tz: string, d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Local hour (0–23) in the given IANA timezone. */
export function localHour(tz: string, d: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      hour12: false,
    }).format(d),
  );
}

/** dateStr + n days, in pure calendar arithmetic (no timezone involved). */
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000,
  );
}

export function isVacationDay(dateStr: string, vacations: VacationRange[]): boolean {
  return vacations.some((v) => v.start <= dateStr && dateStr <= v.end);
}

/** Study days remaining before `until` (exclusive), skipping vacation days. */
export function grindDaysLeft(
  today: string,
  until: string,
  vacations: VacationRange[],
): number {
  let count = 0;
  for (let d = today; d < until; d = addDays(d, 1)) {
    if (!isVacationDay(d, vacations)) count++;
  }
  return Math.max(0, count);
}

/**
 * Consecutive goal-met days ending today (or yesterday, when today's goal
 * isn't met yet — today doesn't break the streak while it's still winnable).
 * Vacation days are skipped, not broken.
 */
export function computeStreak(
  minutesByDay: Record<string, number>,
  goal: number,
  today: string,
  vacations: VacationRange[],
): number {
  let streak = 0;
  let d = today;
  if ((minutesByDay[d] ?? 0) >= goal && !isVacationDay(d, vacations)) {
    streak++;
  }
  d = addDays(d, -1);
  // Walk back a bounded window (the summer is ~10 weeks).
  for (let i = 0; i < 400; i++) {
    if (isVacationDay(d, vacations)) {
      d = addDays(d, -1);
      continue;
    }
    if ((minutesByDay[d] ?? 0) >= goal) {
      streak++;
      d = addDays(d, -1);
    } else {
      break;
    }
  }
  return streak;
}

export function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
