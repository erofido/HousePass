import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { dbErrorResponse, parseBody } from "@/lib/api";
import { requireStation } from "@/lib/station-auth";

const schema = z.object({
  outingId: z.string().uuid(),
  via: z.enum(["kiosk_qr", "kiosk_tap"]),
});

/** Confirm departure on an approved outing. Timestamp is set in the DB. */
export async function POST(request: Request) {
  const { session, response } = await requireStation();
  if (!session) return response;

  const { data, error } = await parseBody(request, schema);
  if (error) return error;

  const db = createSupabaseAdminClient();
  const { data: outing, error: dbError } = await db.rpc("app_station_sign_out", {
    p_house_id: session.houseId,
    p_outing_id: data.outingId,
    p_via: data.via,
    p_station_id: session.id,
  });

  if (dbError) return dbErrorResponse(dbError);
  return NextResponse.json({ outing });
}
