import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { dbErrorResponse, jsonError, parseBody } from "@/lib/api";
import { requireStation } from "@/lib/station-auth";

const schema = z.object({
  studentId: z.string().uuid(),
  via: z.enum(["kiosk_qr", "kiosk_tap"]),
});

/** Welcome back: completes the open outing. */
export async function POST(request: Request) {
  const { session, response } = await requireStation();
  if (!session) return response;

  const { data, error } = await parseBody(request, schema);
  if (error) return error;

  const db = createSupabaseAdminClient();
  const { data: outing, error: dbError } = await db.rpc("app_station_sign_in", {
    p_house_id: session.houseId,
    p_student_id: data.studentId,
    p_via: data.via,
    p_station_id: session.id,
  });

  if (dbError) return dbErrorResponse(dbError);
  if (!outing) {
    // complete_sign_in found nothing open (already in); friendly no-op
    return jsonError(409, "no_open_outing", "Already signed in — nothing to do.");
  }
  return NextResponse.json({ outing });
}
