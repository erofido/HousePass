import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeStreak,
  daysBetween,
  grindDaysLeft,
  isVacationDay,
  localDateISO,
  localHour,
} from "@/lib/time";
import {
  newlyEarned,
  type AchievementContext,
  type AchievementDef,
} from "@/lib/levels";
import { pushToAllDevices } from "@/lib/push";
import type { Profile, Subject, Task } from "@/lib/types";

interface SessionRow {
  id: string;
  subject_id: string | null;
  focus: string | null;
  started_at: string;
  ended_at: string | null;
  minutes: number | null;
}

/** Everything the app reasons about, loaded in one go (single-user scale). */
export interface Core {
  profile: Profile;
  subjects: Subject[];
  tasks: Task[];
  sessions: SessionRow[];
  activeSession: SessionRow | null;
  today: string;
  minutesByDay: Record<string, number>;
  todayMinutes: number;
  todayBySubject: Record<string, number>;
  totalMinutes: number;
  streak: number;
}

export async function loadCore(db: SupabaseClient): Promise<Core> {
  const [profileRes, subjectsRes, tasksRes, sessionsRes] = await Promise.all([
    db.from("profile").select("*").limit(1).single(),
    db.from("subjects").select("*").order("sort"),
    db.from("tasks").select("*").order("sort"),
    db.from("sessions").select("*").order("started_at"),
  ]);

  if (profileRes.error) {
    throw new Error(`profile not found — log in once to seed (${profileRes.error.message})`);
  }
  const profile = profileRes.data as Profile;
  const subjects = (subjectsRes.data ?? []) as Subject[];
  const tasks = (tasksRes.data ?? []) as Task[];
  const sessions = (sessionsRes.data ?? []) as SessionRow[];

  const tz = profile.timezone;
  const today = localDateISO(tz);
  const minutesByDay: Record<string, number> = {};
  const todayBySubject: Record<string, number> = {};
  let totalMinutes = 0;
  let todayMinutes = 0;

  for (const s of sessions) {
    if (!s.minutes) continue;
    const day = localDateISO(tz, new Date(s.started_at));
    minutesByDay[day] = (minutesByDay[day] ?? 0) + s.minutes;
    totalMinutes += s.minutes;
    if (day === today) {
      todayMinutes += s.minutes;
      const key = s.subject_id ?? "none";
      todayBySubject[key] = (todayBySubject[key] ?? 0) + s.minutes;
    }
  }

  return {
    profile,
    subjects,
    tasks,
    sessions,
    activeSession: sessions.find((s) => !s.ended_at) ?? null,
    today,
    minutesByDay,
    todayMinutes,
    todayBySubject,
    totalMinutes,
    streak: computeStreak(
      minutesByDay,
      profile.daily_goal_minutes,
      today,
      profile.vacations ?? [],
    ),
  };
}

export function countdowns(core: Core) {
  const { profile, today } = core;
  return {
    daysToSchool: Math.max(0, daysBetween(today, profile.school_start)),
    daysToBirthday: profile.birthday
      ? Math.max(0, daysBetween(today, profile.birthday))
      : 0,
    grindDays: grindDaysLeft(today, profile.school_start, profile.vacations ?? []),
    onVacation: isVacationDay(today, profile.vacations ?? []),
  };
}

function taskCounts(core: Core, subjectShortName: string) {
  const subject = core.subjects.find((s) => s.short_name === subjectShortName);
  const list = subject
    ? core.tasks.filter((t) => t.subject_id === subject.id && t.category === "subject")
    : [];
  return { done: list.filter((t) => t.done).length, total: list.length };
}

export function buildAchievementContext(
  core: Core,
  extras: { sessionStartHour?: number | null; sessionEndHour?: number | null } = {},
): AchievementContext {
  const { tasks, profile } = core;
  const chem = taskCounts(core, "Chem");
  const math = taskCounts(core, "Maths");
  const coursework = tasks.filter(
    (t) => t.category === "coursework" || t.category === "ee",
  );
  const uni = tasks.filter((t) => t.category === "university");
  const eeDraft = tasks.find((t) => t.title.startsWith("EE full draft"));
  const finished = core.sessions.filter((s) => s.minutes);

  return {
    totalMinutes: core.totalMinutes,
    totalSessions: finished.length,
    streak: core.streak,
    maxDayMinutes: Math.max(0, ...Object.values(core.minutesByDay)),
    todayMinutes: core.todayMinutes,
    goalMinutes: profile.daily_goal_minutes,
    tasksDone: tasks.filter((t) => t.done).length,
    tasksTotal: tasks.length,
    chemDone: chem.done,
    chemTotal: chem.total,
    mathDone: math.done,
    mathTotal: math.total,
    courseworkDone: coursework.filter((t) => t.done).length,
    courseworkTotal: coursework.length,
    eeDraftDone: Boolean(eeDraft?.done),
    uniDone: uni.filter((t) => t.done).length,
    uniTotal: uni.length,
    bestSnake: profile.best_snake,
    sessionStartHour: extras.sessionStartHour ?? null,
    sessionEndHour: extras.sessionEndHour ?? null,
  };
}

/**
 * Evaluate achievements, persist new unlocks, and celebrate each with a
 * push notification. Returns the newly unlocked definitions.
 */
export async function syncAchievements(
  db: SupabaseClient,
  ctx: AchievementContext,
): Promise<AchievementDef[]> {
  const { data: rows } = await db.from("achievements").select("code");
  const unlocked = new Set((rows ?? []).map((r: { code: string }) => r.code));
  const fresh = newlyEarned(ctx, unlocked);
  if (fresh.length === 0) return [];

  await db
    .from("achievements")
    .upsert(fresh.map((a) => ({ code: a.code })), { onConflict: "code" });

  for (const a of fresh) {
    await pushToAllDevices(db, {
      title: `Achievement unlocked ${a.icon}`,
      body: `${a.name} — ${a.desc}`,
      url: "/stats",
      tag: `achievement-${a.code}`,
    });
  }
  return fresh;
}

export function localNow(profile: Profile) {
  return {
    date: localDateISO(profile.timezone),
    hour: localHour(profile.timezone),
  };
}
