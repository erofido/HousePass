import { NextResponse } from "next/server";
import { requireCron } from "@/lib/api";
import { createDb } from "@/lib/db";
import { countdowns, loadCore } from "@/lib/data";
import { nagGapMinutes, pickNag } from "@/lib/nags";
import { coachNag } from "@/lib/coach";
import { pushConfigured, pushToAllDevices } from "@/lib/push";
import { localHour } from "@/lib/time";

/**
 * The pestering engine. Point any scheduler at this every 20–30 minutes;
 * it self-gates:
 *   - quiet hours (before 9am / after 10pm local) → silence
 *   - vacation day → silence
 *   - timer currently running → silence (he's studying, leave him alone)
 *   - daily goal met → silence (celebration was already sent)
 *   - otherwise: escalating nag, spaced out by nagGapMinutes()
 */
export async function POST(request: Request) {
  const denied = requireCron(request);
  if (denied) return denied;

  if (!pushConfigured()) {
    return NextResponse.json({ skipped: "push_not_configured" });
  }

  const db = createDb();
  const core = await loadCore(db);
  const { profile, today, todayMinutes } = core;
  const hour = localHour(profile.timezone);
  const cd = countdowns(core);

  if (hour < 9 || hour >= 22) return NextResponse.json({ skipped: "quiet_hours" });
  if (cd.onVacation) return NextResponse.json({ skipped: "vacation" });
  if (core.activeSession) return NextResponse.json({ skipped: "session_running" });
  if (todayMinutes >= profile.daily_goal_minutes) {
    return NextResponse.json({ skipped: "goal_met" });
  }

  const { data: dayRow } = await db
    .from("days")
    .select("nag_count, last_nag_at")
    .eq("day", today)
    .maybeSingle();
  const nagCount = dayRow?.nag_count ?? 0;

  const gap = nagGapMinutes(hour, profile.nag_intensity);
  if (dayRow?.last_nag_at) {
    const sinceMin = (Date.now() - new Date(dayRow.last_nag_at).getTime()) / 60_000;
    if (sinceMin < gap) {
      return NextResponse.json({ skipped: "too_soon", nextInMin: Math.ceil(gap - sinceMin) });
    }
  }

  const nag = pickNag({
    name: profile.name,
    minutes: todayMinutes,
    goal: profile.daily_goal_minutes,
    hour,
    intensity: profile.nag_intensity,
    daysToSchool: cd.daysToSchool,
    streak: core.streak,
    nagCount,
  });

  // The coach writes a fresh, personal one when configured; canned otherwise.
  const aiBody = await coachNag(core, hour);
  if (aiBody) nag.body = aiBody;

  const delivered = await pushToAllDevices(db, {
    ...nag,
    url: "/",
    tag: "nag", // replaces the previous nag instead of stacking
  });

  await db.from("days").upsert(
    { day: today, nag_count: nagCount + 1, last_nag_at: new Date().toISOString() },
    { onConflict: "day" },
  );

  return NextResponse.json({ sent: nag.title, devices: delivered, nagCount: nagCount + 1 });
}

export const GET = POST;
