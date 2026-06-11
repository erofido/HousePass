import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCron } from "@/lib/cron-auth";
import { sendEmail } from "@/lib/mailer";
import { fmtTime, minutesLate } from "@/lib/time";

interface OverdueRow {
  id: string;
  house_id: string;
  expected_back_at: string;
  signed_out_at: string;
  location_text: string | null;
  students: { full_name: string; room: string | null } | null;
  locations: { name: string } | null;
  houses: { name: string } | null;
}

/**
 * Late alerts: students who are out past their due-back time and not yet
 * alerted on. One email per house to its active staff (+ leadership homed
 * there). Run every few minutes — see README "Scheduling".
 */
export async function POST(request: Request) {
  const denied = requireCron(request);
  if (denied) return denied;

  const db = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await db
    .from("outings")
    .select(
      "id, house_id, expected_back_at, signed_out_at, location_text, students(full_name, room), locations(name), houses(name)",
    )
    .not("signed_out_at", "is", null)
    .is("signed_in_at", null)
    .is("late_alerted_at", null)
    .lt("expected_back_at", nowIso)
    .returns<OverdueRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ overdue: 0, alerted: 0 });
  }

  const byHouse = new Map<string, OverdueRow[]>();
  for (const row of data) {
    byHouse.set(row.house_id, [...(byHouse.get(row.house_id) ?? []), row]);
  }

  let alerted = 0;
  const skipped: string[] = [];

  for (const [houseId, rows] of byHouse) {
    const houseName = rows[0].houses?.name ?? "House";

    const { data: recipients } = await db
      .from("staff")
      .select("email")
      .eq("house_id", houseId)
      .eq("active", true);
    const to = (recipients ?? []).map((r) => r.email);

    let delivered = false;
    if (to.length > 0) {
      const lines = rows
        .map((r) => {
          const dest = r.locations?.name ?? r.location_text ?? "—";
          const late = minutesLate(r.expected_back_at);
          return `<li><strong>${r.students?.full_name ?? "Unknown"}</strong> (Rm ${r.students?.room ?? "—"}) — ${dest}, due ${fmtTime(r.expected_back_at)}, <strong>${late} min late</strong></li>`;
        })
        .join("");
      const result = await sendEmail(
        to,
        `HousePass: ${rows.length} overdue in ${houseName}`,
        `<p>The following student${rows.length === 1 ? " is" : "s are"} overdue in ${houseName}:</p><ul>${lines}</ul><p>Open the live board to follow up. This alert fires once per outing; adjusting the due-back time re-arms it.</p>`,
      );
      delivered = result.sent;
    }

    // Mark as alerted when the email went out, or when there is genuinely
    // nobody to tell. If email is unconfigured/down, leave unmarked so the
    // next run retries.
    if (delivered || to.length === 0) {
      const ids = rows.map((r) => r.id);
      await db
        .from("outings")
        .update({ late_alerted_at: nowIso })
        .in("id", ids)
        .is("late_alerted_at", null);
      await db.from("audit_log").insert({
        house_id: houseId,
        actor_type: "system",
        actor_id: null,
        action: "outing.late_alert_sent",
        entity: "house",
        entity_id: houseId,
        meta: { outings: ids, recipients: to.length, delivered },
      });
      alerted += rows.length;
    } else {
      skipped.push(houseName);
    }
  }

  return NextResponse.json({
    overdue: data.length,
    alerted,
    ...(skipped.length ? { emailPendingFor: skipped } : {}),
  });
}

/** Convenience for schedulers that can only GET. */
export const GET = POST;
