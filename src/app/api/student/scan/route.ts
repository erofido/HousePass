import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { dbErrorResponse, jsonError, parseBody } from "@/lib/api";
import { getStudentSession } from "@/lib/student-auth";
import { parseStationPayload, verifyStationCode } from "@/lib/totp";

const schema = z.object({
  // the rotating code scanned off the office iPad: "HPK:<stationId>:<code>"
  station: z.string().trim().min(8).max(200),
  // optional intent for going out (omit to sign back in)
  outingId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  expectedBackAt: z.string().datetime({ offset: true }).optional(),
});

/**
 * Phone scans the office screen to sign out / in. The scanned station code is
 * verified against the SERVER clock (proves the phone was physically at that
 * screen just now); the action is bound to the signed-in student (can't act
 * for anyone else). Timestamps are set in the database.
 *
 * Auto-detects intent: OUT -> sign in; otherwise sign out (an approved outing
 * by id, or a self-service destination by id).
 */
export async function POST(request: Request) {
  const session = await getStudentSession();
  if (!session) return jsonError(401, "unauthenticated", "Sign in first");

  const { data, error } = await parseBody(request, schema);
  if (error) return error;

  const parsed = parseStationPayload(data.station);
  if (!parsed) {
    return jsonError(400, "bad_station_code", "That isn't an office code — point your camera at the screen on the office iPad.");
  }

  const db = createSupabaseAdminClient();

  // Station must exist, be active, and belong to the student's house.
  const { data: station } = await db
    .from("stations")
    .select("id, house_id, code_secret, active")
    .eq("id", parsed.stationId)
    .maybeSingle();
  if (!station || !station.active || station.house_id !== session.houseId) {
    return jsonError(404, "unknown_station", "That office screen isn't for your house.");
  }
  if (!verifyStationCode(station.code_secret, parsed.code)) {
    return jsonError(
      401,
      "code_expired",
      "The office code refreshed — hold your phone to the screen and try again.",
    );
  }

  // Current student state decides the action.
  const { data: student } = await db
    .from("students")
    .select("id, status, active")
    .eq("id", session.id)
    .maybeSingle();
  if (!student || !student.active) {
    return jsonError(401, "unauthenticated", "Account no longer active");
  }

  // COMING BACK: sign in.
  if (student.status === "out") {
    const { data: outing, error: e } = await db.rpc("app_station_sign_in", {
      p_house_id: session.houseId,
      p_student_id: session.id,
      p_via: "phone_scan",
      p_station_id: station.id,
    });
    if (e) return dbErrorResponse(e);
    if (!outing) return jsonError(409, "no_open_outing", "You're already signed in.");
    return NextResponse.json({ action: "signed_in", outing });
  }

  // GOING OUT via an already-approved outing.
  if (data.outingId) {
    const { data: o } = await db
      .from("outings")
      .select("id, student_id, status, signed_out_at")
      .eq("id", data.outingId)
      .maybeSingle();
    if (!o || o.student_id !== session.id) {
      return jsonError(404, "not_found", "That outing isn't yours.");
    }
    const { data: outing, error: e } = await db.rpc("app_station_sign_out", {
      p_house_id: session.houseId,
      p_outing_id: data.outingId,
      p_via: "phone_scan",
      p_station_id: station.id,
    });
    if (e) return dbErrorResponse(e);
    return NextResponse.json({ action: "signed_out", outing });
  }

  // GOING OUT to a self-service destination chosen in the app.
  if (data.locationId) {
    if (!data.expectedBackAt) {
      return jsonError(400, "expected_back_required", "Pick a time to be back by.");
    }
    // Phone scan-to-leave is only for self-service places; permission ones
    // must be requested and approved first.
    const { data: loc } = await db
      .from("locations")
      .select("id, requires_permission, active, house_id")
      .eq("id", data.locationId)
      .maybeSingle();
    if (!loc || !loc.active || (loc.house_id && loc.house_id !== session.houseId)) {
      return jsonError(404, "location_not_found", "That destination isn't available.");
    }
    if (loc.requires_permission) {
      return jsonError(403, "needs_approval", "That place needs a teacher's approval — request it first.");
    }
    const { data: outing, error: e } = await db.rpc("app_station_start", {
      p_house_id: session.houseId,
      p_student_id: session.id,
      p_location_id: data.locationId,
      p_expected_back_at: data.expectedBackAt,
      p_via: "phone_scan",
      p_station_id: station.id,
    });
    if (e) return dbErrorResponse(e);
    return NextResponse.json({ action: "signed_out", outing });
  }

  return jsonError(400, "no_intent", "Choose where you're going before scanning.");
}
