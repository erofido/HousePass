import { NextResponse } from "next/server";
import { createDb } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { countdowns, loadCore } from "@/lib/data";
import { levelFor } from "@/lib/levels";
import type { MePayload } from "@/lib/types";

export async function GET() {
  const denied = await requireSession();
  if (denied) return denied;

  const db = createDb();
  const core = await loadCore(db);

  // Self-repair: a timer left running for 6+ hours was forgotten. Close it
  // at the 4-hour credit cap so the day still counts and nags resume.
  if (core.activeSession) {
    const elapsedMin =
      (Date.now() - new Date(core.activeSession.started_at).getTime()) / 60_000;
    if (elapsedMin > 360) {
      const credit = 240;
      await db
        .from("sessions")
        .update({ ended_at: new Date().toISOString(), minutes: credit })
        .eq("id", core.activeSession.id)
        .is("ended_at", null);
      await db
        .from("profile")
        .update({ xp: core.profile.xp + credit })
        .eq("id", core.profile.id);
      return GET(); // reload with repaired state (recursion depth 1)
    }
  }

  const cd = countdowns(core);
  const subjectById = new Map(core.subjects.map((s) => [s.id, s]));
  const nextTasks = core.tasks
    .filter((t) => !t.done)
    .sort((a, b) => {
      const pa = a.subject_id ? (subjectById.get(a.subject_id)?.priority ?? 2) : 2;
      const pb = b.subject_id ? (subjectById.get(b.subject_id)?.priority ?? 2) : 2;
      return pa - pb || a.sort - b.sort;
    })
    .slice(0, 4)
    .map((t) => ({
      ...t,
      subjectName: t.subject_id
        ? (subjectById.get(t.subject_id)?.name ?? null)
        : null,
    }));

  const payload: MePayload = {
    profile: core.profile,
    subjects: core.subjects,
    today: core.today,
    todayMinutes: core.todayMinutes,
    todayBySubject: core.todayBySubject,
    activeSession: core.activeSession,
    streak: core.streak,
    level: levelFor(core.profile.xp),
    ...cd,
    goalMet: core.todayMinutes >= core.profile.daily_goal_minutes,
    nextTasks,
    tasksDone: core.tasks.filter((t) => t.done).length,
    tasksTotal: core.tasks.length,
  };
  return NextResponse.json(payload);
}
