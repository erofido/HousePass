import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { createDb } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { buildAchievementContext, loadCore, syncAchievements } from "@/lib/data";
import { localHour } from "@/lib/time";
import { goalMetNag } from "@/lib/nags";
import { pushToAllDevices } from "@/lib/push";

/** Credit cap per session: 5 hours (forgotten timers are repaired in /api/me). */
const MAX_SESSION_MINUTES = 300;

export async function POST() {
  const denied = await requireSession();
  if (denied) return denied;

  const db = createDb();
  const { data: active } = await db
    .from("sessions")
    .select("id, subject_id, started_at")
    .is("ended_at", null)
    .limit(1)
    .maybeSingle();

  if (!active) return jsonError(404, "no_session", "No session is running.");

  const now = new Date();
  const startedAt = new Date(active.started_at);
  const minutes = Math.min(
    MAX_SESSION_MINUTES,
    Math.round((now.getTime() - startedAt.getTime()) / 60_000),
  );

  // Sub-minute misclick: discard rather than credit.
  if (minutes < 1) {
    await db.from("sessions").delete().eq("id", active.id);
    return NextResponse.json({ discarded: true, minutes: 0, xpGained: 0, newAchievements: [], goalMet: false });
  }

  const { error: updateError } = await db
    .from("sessions")
    .update({ ended_at: now.toISOString(), minutes })
    .eq("id", active.id)
    .is("ended_at", null);
  if (updateError) return jsonError(500, "server_error", updateError.message);

  const core = await loadCore(db); // fresh totals including this session
  const goal = core.profile.daily_goal_minutes;
  const goalJustMet =
    core.todayMinutes >= goal && core.todayMinutes - minutes < goal;

  await db
    .from("profile")
    .update({ xp: core.profile.xp + minutes })
    .eq("id", core.profile.id);
  core.profile.xp += minutes;

  if (goalJustMet) {
    // Celebrate once per day; the nag cron checks the same flag.
    await db
      .from("days")
      .upsert({ day: core.today, goal_met_notified: true }, { onConflict: "day" });
    const nag = goalMetNag(core.todayMinutes, core.streak);
    await pushToAllDevices(db, { ...nag, url: "/arcade", tag: "goal-met" });
  }

  const tz = core.profile.timezone;
  const fresh = await syncAchievements(
    db,
    buildAchievementContext(core, {
      sessionStartHour: localHour(tz, startedAt),
      sessionEndHour: localHour(tz, now),
    }),
  );

  return NextResponse.json({
    minutes,
    xpGained: minutes,
    todayMinutes: core.todayMinutes,
    goalMet: core.todayMinutes >= goal,
    goalJustMet,
    newAchievements: fresh.map((a) => ({ code: a.code, name: a.name, icon: a.icon })),
  });
}
