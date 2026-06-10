/** Time helpers shared by kiosk, dashboard and student app. */

export function fmtTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
}

export function fmtDayTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? fmtTime(d)
    : d.toLocaleString("en-GB", {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      });
}

export function isOverdue(expectedBackAt: string | null, now: Date = new Date()): boolean {
  if (!expectedBackAt) return false;
  return now.getTime() > new Date(expectedBackAt).getTime();
}

export function minutesLate(expectedBackAt: string | null, now: Date = new Date()): number {
  if (!expectedBackAt) return 0;
  const diff = now.getTime() - new Date(expectedBackAt).getTime();
  return diff > 0 ? Math.floor(diff / 60000) : 0;
}

export function minutesOut(signedOutAt: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(signedOutAt).getTime()) / 60000));
}

export function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Quick due-back choices offered at the kiosk / in the student app. */
export interface BackByChoice {
  label: string;
  iso: string;
}

export function backByChoices(now: Date = new Date()): BackByChoice[] {
  const plus = (mins: number) => new Date(now.getTime() + mins * 60000);
  const choices: BackByChoice[] = [
    { label: "30 min", iso: plus(30).toISOString() },
    { label: "1 hour", iso: plus(60).toISOString() },
    { label: "2 hours", iso: plus(120).toISOString() },
  ];
  // "By 21:00" style curfew chip, only if it is still ahead of the latest chip
  const curfew = new Date(now);
  curfew.setHours(21, 0, 0, 0);
  if (curfew.getTime() > plus(120).getTime()) {
    choices.push({ label: `By ${fmtTime(curfew)}`, iso: curfew.toISOString() });
  }
  return choices;
}

/** Turn an <input type="time"> value (HH:MM) into an ISO timestamp today/tomorrow. */
export function timeInputToIso(value: string, now: Date = new Date()): string | null {
  const m = value.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(now);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  // a time earlier than now means "tomorrow" (e.g. overnight leave)
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d.toISOString();
}
