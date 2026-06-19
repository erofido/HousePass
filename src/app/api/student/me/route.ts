import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jsonError } from "@/lib/api";
import { getStudentSession } from "@/lib/student-auth";
import { QR_PERIOD_SECONDS } from "@/lib/totp";

interface OutingRow {
  id: string;
  status: string;
  expected_back_at: string | null;
  signed_out_at: string | null;
  requested_at: string;
  note: string | null;
  location_text: string | null;
  locations: { name: string } | null;
}

/** Everything the student home screen needs in one call. */
export async function GET() {
  const session = await getStudentSession();
  if (!session) return jsonError(401, "unauthenticated", "Sign in first");

  const db = createSupabaseAdminClient();
  const { data: student, error } = await db
    .from("students")
    .select(
      "id, house_id, full_name, room, year_group, status, qr_token, qr_secret, active, houses(name)",
    )
    .eq("id", session.id)
    .maybeSingle();

  if (error) return jsonError(500, "server_error", "Could not load your record");
  if (!student || !student.active) {
    return jsonError(401, "unauthenticated", "Account no longer active");
  }

  const { data: outings } = await db
    .from("outings")
    .select(
      "id, status, expected_back_at, signed_out_at, requested_at, note, location_text, locations(name)",
    )
    .eq("student_id", student.id)
    .in("status", ["requested", "approved", "out"])
    .order("requested_at", { ascending: false })
    .returns<OutingRow[]>();

  const pack = (o: OutingRow) => ({
    id: o.id,
    status: o.status,
    destination: o.locations?.name ?? o.location_text ?? "—",
    expectedBackAt: o.expected_back_at,
    signedOutAt: o.signed_out_at,
    requestedAt: o.requested_at,
    note: o.note,
  });

  const open = (outings ?? []).find((o) => o.status === "out");

  // The student's year-group curfew (if set) — the app uses it as the default
  // and cap for the "back by" time.
  let curfewTime: string | null = null;
  if (student.year_group) {
    const { data: curfew } = await db
      .from("curfews")
      .select("back_by")
      .eq("house_id", student.house_id)
      .eq("year_group", student.year_group)
      .maybeSingle();
    if (curfew?.back_by) curfewTime = String(curfew.back_by).slice(0, 5);
  }

  return NextResponse.json({
    student: {
      id: student.id,
      fullName: student.full_name,
      room: student.room,
      yearGroup: student.year_group,
      status: student.status,
      houseName: (student.houses as unknown as { name: string } | null)?.name ?? "",
      curfewTime,
    },
    // The phone derives a rotating code from this locally (see PassQr); the
    // server clock (serverTime) is the source of truth so a wrong device
    // clock can't desync an honest student.
    qr: {
      token: student.qr_token,
      secret: student.qr_secret,
      period: QR_PERIOD_SECONDS,
    },
    serverTime: Date.now(),
    openOuting: open ? pack(open) : null,
    requests: (outings ?? []).filter((o) => o.status !== "out").map(pack),
  });
}
