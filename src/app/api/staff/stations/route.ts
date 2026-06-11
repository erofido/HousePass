import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jsonError, parseBody } from "@/lib/api";
import { requireStaff, staffCanAccessHouse } from "@/lib/staff-auth";

/** Stations for the houses this staff member can see (no secrets returned). */
export async function GET() {
  const { staff, response } = await requireStaff();
  if (!staff) return response;

  const db = createSupabaseAdminClient();
  let q = db
    .from("stations")
    .select("id, house_id, name, active, last_seen_at, created_at, houses(name)")
    .order("created_at");
  if (staff.role !== "leadership") q = q.eq("house_id", staff.house_id!);

  const { data, error } = await q;
  if (error) return jsonError(500, "server_error", "Could not load stations");
  return NextResponse.json({ stations: data });
}

const createSchema = z.object({
  houseId: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
});

/** Register a new station; the pairing token is returned exactly once. */
export async function POST(request: Request) {
  const { staff, response } = await requireStaff();
  if (!staff) return response;

  const { data, error } = await parseBody(request, createSchema);
  if (error) return error;
  if (!staffCanAccessHouse(staff, data.houseId)) {
    return jsonError(403, "wrong_house", "You can only manage your own house");
  }

  const token = `hpst_${randomBytes(24).toString("hex")}`;
  const db = createSupabaseAdminClient();
  const { data: station, error: dbError } = await db
    .from("stations")
    .insert({
      house_id: data.houseId,
      name: data.name,
      token_hash: createHash("sha256").update(token).digest("hex"),
    })
    .select("id, name, house_id")
    .single();

  if (dbError) return jsonError(500, "server_error", "Could not create the station");

  await db.from("audit_log").insert({
    house_id: data.houseId,
    actor_type: "staff",
    actor_id: staff.id,
    action: "station.created",
    entity: "station",
    entity_id: station.id,
  });

  return NextResponse.json({ station, token });
}
