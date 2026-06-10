import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jsonError, parseBody } from "@/lib/api";
import {
  createSessionToken,
  sessionCookieOptions,
  STATION_COOKIE,
  STATION_SESSION_MAX_AGE,
} from "@/lib/session";

const schema = z.object({
  token: z.string().trim().min(20).max(200),
});

/** Pair this device as a house's office station using its station token. */
export async function POST(request: Request) {
  const { data, error } = await parseBody(request, schema);
  if (error) return error;

  const db = createSupabaseAdminClient();
  const hash = createHash("sha256").update(data.token).digest("hex");

  const { data: station, error: dbError } = await db
    .from("stations")
    .select("id, house_id, name, active, houses(name)")
    .eq("token_hash", hash)
    .eq("active", true)
    .maybeSingle();

  if (dbError) return jsonError(500, "server_error", "Could not verify the token");
  if (!station) return jsonError(401, "bad_token", "Station token not recognised");

  await db
    .from("stations")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", station.id);
  await db.from("audit_log").insert({
    house_id: station.house_id,
    actor_type: "station",
    actor_id: station.id,
    action: "station.paired",
    entity: "station",
    entity_id: station.id,
  });

  const token = await createSessionToken(
    { kind: "station", id: station.id, houseId: station.house_id },
    STATION_SESSION_MAX_AGE,
  );
  const store = await cookies();
  store.set(STATION_COOKIE, token, sessionCookieOptions(STATION_SESSION_MAX_AGE));

  const houseName = (station.houses as unknown as { name: string } | null)?.name;
  return NextResponse.json({
    station: { id: station.id, name: station.name, houseName },
  });
}
