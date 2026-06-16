import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCron } from "@/lib/cron-auth";
import { pushConfigured, pushToHouseStaff, pushToSubscriber } from "@/lib/push";
import { fmtTime, minutesLate } from "@/lib/time";

interface Row {
  id: string;
  student_id: string;
  house_id: string;
  expected_back_at: string;
  location_text: string | null;
  remind_sent_at: string | null;
  overdue_push_sent_at: string | null;
  students: { full_name: string } | null;
  locations: { name: string } | null;
}

const SELECT =
  "id, student_id, house_id, expected_back_at, location_text, remind_sent_at, overdue_push_sent_at, students(full_name), locations(name)";

/**
 * Push notifications, run frequently (every ~2 min):
 *   1. "Be back soon" to the student, REMIND_BEFORE_MINUTES before due.
 *   2. "You're overdue" to the student AND "X is late" to house staff, once
 *      past due.
 * Each fires at most once per outing (timestamps gate it); changing the
 * due-back time re-arms both (see api_update_expected_back).
 */
export async function POST(request: Request) {
  const denied = requireCron(request);
  if (denied) return denied;

  if (!pushConfigured()) {
    return NextResponse.json({ skipped: "push_not_configured" });
  }

  const db = createSupabaseAdminClient();
  const now = Date.now();
  const lead = Math.max(1, Number(process.env.REMIND_BEFORE_MINUTES) || 10);
  const soonIso = new Date(now + lead * 60_000).toISOString();
  const nowIso = new Date(now).toISOString();

  // Currently-out, not signed in.
  const { data, error } = await db
    .from("outings")
    .select(SELECT)
    .not("signed_out_at", "is", null)
    .is("signed_in_at", null)
    .not("expected_back_at", "is", null)
    .returns<Row[]>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ reminded: 0, overdue: 0 });

  let reminded = 0;
  let overdue = 0;

  for (const o of data) {
    const due = new Date(o.expected_back_at).getTime();
    const dest = o.locations?.name ?? o.location_text ?? "your outing";

    // 2. Overdue: student + staff, once.
    if (due < now && !o.overdue_push_sent_at) {
      const late = minutesLate(o.expected_back_at);
      await pushToSubscriber(db, "student", o.student_id, {
        title: "You're overdue",
        body: `You're ${late} min late from ${dest}. Head back and sign in at the office.`,
        url: "/student",
        tag: `overdue-${o.id}`,
      });
      await pushToHouseStaff(db, o.house_id, {
        title: "Student overdue",
        body: `${o.students?.full_name ?? "A student"} is ${late} min late from ${dest}.`,
        url: "/staff",
        tag: `late-${o.id}`,
      });
      await db
        .from("outings")
        .update({ overdue_push_sent_at: nowIso })
        .eq("id", o.id)
        .is("overdue_push_sent_at", null);
      overdue++;
      continue;
    }

    // 1. Reminder: student only, within the lead window, once.
    if (due >= now && o.expected_back_at <= soonIso && !o.remind_sent_at) {
      await pushToSubscriber(db, "student", o.student_id, {
        title: "Be back soon",
        body: `You're due back from ${dest} at ${fmtTime(o.expected_back_at)}. Sign in at the office.`,
        url: "/student",
        tag: `remind-${o.id}`,
      });
      await db
        .from("outings")
        .update({ remind_sent_at: nowIso })
        .eq("id", o.id)
        .is("remind_sent_at", null);
      reminded++;
    }
  }

  return NextResponse.json({ reminded, overdue });
}

export const GET = POST;
