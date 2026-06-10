import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jsonError, parseBody } from "@/lib/api";
import { requireStation } from "@/lib/station-auth";

const schema = z
  .object({
    qrToken: z.string().trim().min(8).max(120).optional(),
    studentId: z.string().uuid().optional(),
  })
  .refine((v) => v.qrToken || v.studentId, { message: "qrToken or studentId required" });

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
 * One scan / tap resolves everything the kiosk needs to branch:
 * who this is, whether they're in or out, what's approved or pending.
 */
export async function POST(request: Request) {
  const { session, response } = await requireStation();
  if (!session) return response;

  const { data, error } = await parseBody(request, schema);
  if (error) return error;

  const db = createSupabaseAdminClient();

  let q = db
    .from("students")
    .select("id, full_name, room, year_group, status")
    .eq("house_id", session.houseId)
    .eq("active", true);
  q = data.qrToken ? q.eq("qr_token", data.qrToken) : q.eq("id", data.studentId!);
  const { data: student, error: sErr } = await q.maybeSingle();

  if (sErr) return jsonError(500, "server_error", "Lookup failed — try again");
  if (!student) {
    return jsonError(
      404,
      "unknown_pass",
      "Pass not recognised for this house. Tap your name instead, or see staff.",
    );
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
  const approved = (outings ?? []).filter(
    (o) => o.status === "approved" && !o.signed_out_at,
  );
  const requested = (outings ?? []).filter((o) => o.status === "requested");

  return NextResponse.json({
    student,
    openOuting: open ? pack(open) : null,
    approvedOutings: approved.map(pack),
    requestedOutings: requested.map(pack),
  });
}
