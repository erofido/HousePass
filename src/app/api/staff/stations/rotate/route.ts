import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jsonError, parseBody } from "@/lib/api";
import { requireStaff, staffCanAccessHouse } from "@/lib/staff-auth";

const schema = z.object({ stationId: z.string().uuid() });

/**
 * Rotate a station token (lost / replaced iPad). Existing device sessions
 * keep working until their cookie expires; pairing a device again needs
 * the new token. Returned exactly once.
 */
export async function POST(request: Request) {
  const { staff, response } = await requireStaff();
  if (!staff) return response;

  const { data, error } = await parseBody(request, schema);
  if (error) return error;

  const db = createSupabaseAdminClient();
  const { data: station } = await db
    .from("stations")
    .select("id, house_id, name")
    .eq("id", data.stationId)
    .maybeSingle();
  if (!station || !staffCanAccessHouse(staff, station.house_id)) {
    return jsonError(404, "not_found", "Station not found");
  }

  const token = `hpst_${randomBytes(24).toString("hex")}`;
  const { error: dbError } = await db
    .from("stations")
    .update({ token_hash: createHash("sha256").update(token).digest("hex") })
    .eq("id", station.id);
  if (dbError) return jsonError(500, "server_error", "Could not rotate the token");

  await db.from("audit_log").insert({
    house_id: station.house_id,
    actor_type: "staff",
    actor_id: staff.id,
    action: "station.token_rotated",
    entity: "station",
    entity_id: station.id,
  });

  return NextResponse.json({ token });
}
