import { NextResponse } from "next/server";
import { createDb } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { loadCore } from "@/lib/data";
import { ACHIEVEMENTS } from "@/lib/levels";
import { addDays, daysBetween } from "@/lib/time";
import { KEY_DATES } from "@/lib/plan";
import type { StatsPayload, Task } from "@/lib/types";

export async function GET() {
  const denied = await requireSession();
  if (denied) return denied;

  const db = createDb();
  const core = await loadCore(db);
  const { data: unlockedRows } = await db
    .from("achievements")
    .select("code, unlocked_at");
  const unlockedAt = new Map(
    (unlockedRows ?? []).map((r: { code: string; unlocked_at: string }) => [
      r.code,
      r.unlocked_at,
    ]),
  );

  // Last 28 days, oldest first.
  const days: { day: string; minutes: number }[] = [];
  for (let i = 27; i >= 0; i--) {
    const day = addDays(core.today, -i);
    days.push({ day, minutes: core.minutesByDay[day] ?? 0 });
  }

  const bySubject = core.subjects.map((subject) => ({
    subject,
    minutes: core.sessions
      .filter((s) => s.subject_id === subject.id && s.minutes)
      .reduce((sum, s) => sum + (s.minutes ?? 0), 0),
  }));

  const daysSinceStart = Math.max(
    1,
    daysBetween(KEY_DATES.holidayStart, core.today) + 1,
  );
  const avgPerDay = Math.round(core.totalMinutes / daysSinceStart);
  const daysLeft = Math.max(0, daysBetween(core.today, core.profile.school_start));

  const group = (label: string, key: string, list: Task[], color: string | null) => ({
    key,
    label,
    color,
    done: list.filter((t) => t.done).length,
    total: list.length,
    xpDone: list.filter((t) => t.done).reduce((s, t) => s + t.xp, 0),
    xpTotal: list.reduce((s, t) => s + t.xp, 0),
  });

  const taskGroups = [
    ...core.subjects.map((s) =>
      group(
        `${s.name} ${s.level}`,
        s.id,
        core.tasks.filter((t) => t.subject_id === s.id),
        s.color,
      ),
    ),
    group("University applications", "university", core.tasks.filter((t) => t.category === "university"), null),
    group("Supercurriculars", "supercurricular", core.tasks.filter((t) => t.category === "supercurricular"), null),
  ].filter((g) => g.total > 0);

  const payload: StatsPayload = {
    days,
    bySubject,
    totalMinutes: core.totalMinutes,
    totalSessions: core.sessions.filter((s) => s.minutes).length,
    avgPerDay,
    projectedTotal: core.totalMinutes + avgPerDay * daysLeft,
    achievements: ACHIEVEMENTS.map((a) => ({
      code: a.code,
      name: a.name,
      desc: a.desc,
      icon: a.icon,
      unlocked_at: unlockedAt.get(a.code) ?? null,
    })),
    taskGroups,
  };
  return NextResponse.json(payload);
}
