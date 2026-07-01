import { NextResponse } from "next/server";
import { requireCron } from "@/lib/api";
import { createDb } from "@/lib/db";
import { loadCore } from "@/lib/data";
import { sendDailySummary } from "@/lib/summary";
import { pushToAllDevices } from "@/lib/push";
import { fmtDuration, localHour } from "@/lib/time";

/**
 * Nightly report to Dad (and Eray). Schedule it after 20:00 UK time — it
 * refuses to run earlier so a misconfigured scheduler can't email a
 * half-finished day, and it sends at most once per day.
 */
export async function POST(request: Request) {
  const denied = requireCron(request);
  if (denied) return denied;

  const db = createDb();
  const core = await loadCore(db);
  const hour = localHour(core.profile.timezone);
  if (hour < 20) return NextResponse.json({ skipped: "too_early", hour });

  const { data: dayRow } = await db
    .from("days")
    .select("summary_sent_at")
    .eq("day", core.today)
    .maybeSingle();
  if (dayRow?.summary_sent_at) return NextResponse.json({ skipped: "already_sent" });

  const result = await sendDailySummary(db, core);
  if (!result.sent) {
    return NextResponse.json({ sent: false, reason: result.reason });
  }

  await db.from("days").upsert(
    { day: core.today, summary_sent_at: new Date().toISOString() },
    { onConflict: "day" },
  );

  await pushToAllDevices(db, {
    title: "📨 Report sent to Dad",
    body: `Today's numbers are out: ${fmtDuration(core.todayMinutes)} studied. Tomorrow's another chance to make it look good.`,
    url: "/stats",
    tag: "summary-sent",
  });

  return NextResponse.json({ sent: true, recipients: result.recipients });
}

export const GET = POST;
