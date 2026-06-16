import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jsonError, parseBody } from "@/lib/api";
import { requireStation } from "@/lib/station-auth";
import { parseRotatingPayload, verifyRotatingCode } from "@/lib/totp";

const schema = z
  .object({
    // a scanned rotating payload "HP2:<token>:<code>"
    qr: z.string().trim().min(8).max(200).optional(),
    // tap-your-name path (office-trusted; no rotating code)
    studentId: z.string().uuid().optional(),
  })
  .refine((v) => v.qr || v.studentId, { message: "qr or studentId required" });

interface OutingRow {
  id: string;
  status: string;
  expected_back_at: string | null;
  signed_out_at: string | null;
  location_text: string | null;
  note: string | null;
  locations: { name: string } | null;
}

const OUTING_SELECT =
  "id, status, expected_back_at, signed_out_at, location_text, note, locations(name)";

function pack(o: OutingRow) {
  return {
    id: o.id,
    status: o.status,
    destination: o.locations?.name ?? o.location_text ?? "—",
    expectedBackAt: o.expected_back_at,
    signedOutAt: o.signed_out_at,
    note: o.note,
  };
}

/**
 * One scan / tap resolves who this is and their current state. A scanned
 * rotating code is verified against the server clock and consumed (replay
 * protection) before the student is revealed; tap-name is office-trusted.
 */
export async function POST(request: Request) {
  const { session, response } = await requireStation();
  if (!session) return response;

  const { data, error } = await parseBody(request, schema);
  if (error) return error;

  const db = createSupabaseAdminClient();

  // Resolve the student, verifying a rotating code on the scan path.
  let studentId: string;

  if (data.qr) {
    const parsed = parseRotatingPayload(data.qr);
    if (!parsed) {
      return jsonError(
        400,
        "bad_pass",
        "That isn't a HousePass code. Make sure the app is open, or tap your name.",
      );
    }
    const { data: match, error: mErr } = await db
      .from("students")
      .select("id, qr_secret, last_qr_step, active")
      .eq("house_id", session.houseId)
      .eq("qr_token", parsed.token)
      .maybeSingle();
    if (mErr) return jsonError(500, "server_error", "Lookup failed — try again");
    if (!match || !match.active) {
      return jsonError(404, "unknown_pass", "Pass not recognised for this house. Tap your name instead.");
    }

    const check = verifyRotatingCode(match.qr_secret, parsed.code, match.last_qr_step);
    if (!check.ok) {
      // stale screenshot, replay, or clock skew — don't reveal the student
      return jsonError(
        401,
        "code_expired",
        "That code has expired — hold your phone up again with the app open, or tap your name.",
      );
    }
    // consume the step: blocks reuse of this (or an earlier) code. Guarded so
    // a concurrent scan can't double-spend.
    const { data: consumed } = await db
      .from("students")
      .update({ last_qr_step: check.step })
      .eq("id", match.id)
      .lt("last_qr_step", check.step)
      .select("id")
      .maybeSingle();
    if (!consumed) {
      return jsonError(401, "code_expired", "That code was just used — show a fresh one.");
    }
    studentId = match.id;
  } else {
    studentId = data.studentId!;
  }

  const { data: student, error: sErr } = await db
    .from("students")
    .select("id, full_name, room, year_group, status")
    .eq("house_id", session.houseId)
    .eq("active", true)
    .eq("id", studentId)
    .maybeSingle();

  if (sErr) return jsonError(500, "server_error", "Lookup failed — try again");
  if (!student) {
    return jsonError(404, "unknown_pass", "Student not found for this house.");
  }

  const { data: outings, error: oErr } = await db
    .from("outings")
    .select(OUTING_SELECT)
    .eq("student_id", student.id)
    .in("status", ["approved", "requested", "out"])
    .order("expected_back_at", { ascending: true })
    .returns<OutingRow[]>();

  if (oErr) return jsonError(500, "server_error", "Lookup failed — try again");

  const open = (outings ?? []).find((o) => o.status === "out") ?? null;
  const approved = (outings ?? []).filter((o) => o.status === "approved" && !o.signed_out_at);
  const requested = (outings ?? []).filter((o) => o.status === "requested");

  return NextResponse.json({
    student,
    openOuting: open ? pack(open) : null,
    approvedOutings: approved.map(pack),
    requestedOutings: requested.map(pack),
  });
}
