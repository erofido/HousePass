import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { dbErrorResponse, parseBody } from "@/lib/api";
import { requireStation } from "@/lib/station-auth";

const schema = z.object({
  studentId: z.string().uuid(),
  locationId: z.string().uuid(),
  expectedBackAt: z.string().datetime({ offset: true }),
  via: z.enum(["kiosk_qr", "kiosk_tap"]),
});

/**
 * Walk-up at the iPad with no prior request. Self-service destinations go
 * straight to 'out'; permission destinations come back as 'requested'.
 */
export async function POST(request: Request) {
  const { session, response } = await requireStation();
  if (!session) return response;

  const { data, error } = await parseBody(request, schema);
  if (error) return error;

  const db = createSupabaseAdminClient();
  const { data: outing, error: dbError } = await db.rpc("app_station_start", {
    p_house_id: session.houseId,
    p_student_id: data.studentId,
    p_location_id: data.locationId,
    p_expected_back_at: data.expectedBackAt,
    p_via: data.via,
    p_station_id: session.id,
  });

  if (dbError) return dbErrorResponse(dbError);
  return NextResponse.json({ outing });
}
