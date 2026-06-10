import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jsonError } from "@/lib/api";
import { requireStation } from "@/lib/station-auth";

/** Station + house identity for the kiosk header. */
export async function GET() {
  const { session, response } = await requireStation();
  if (!session) return response;

  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("stations")
    .select("id, name, active, houses(name)")
    .eq("id", session.id)
    .maybeSingle();

  if (error) return jsonError(500, "server_error", "Could not load station");
  if (!data || !data.active) {
    return jsonError(401, "station_unpaired", "Station has been deactivated");
  }

  await db
    .from("stations")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", session.id);

  return NextResponse.json({
    station: {
      id: data.id,
      name: data.name,
      houseName: (data.houses as unknown as { name: string } | null)?.name ?? "",
    },
  });
}
