import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jsonError } from "@/lib/api";
import { requireStation } from "@/lib/station-auth";

/** Destinations available to this house (house-specific + global). */
export async function GET() {
  const { session, response } = await requireStation();
  if (!session) return response;

  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("locations")
    .select("id, name, requires_permission")
    .eq("active", true)
    .or(`house_id.eq.${session.houseId},house_id.is.null`)
    .order("requires_permission")
    .order("name");

  if (error) return jsonError(500, "server_error", "Could not load destinations");
  return NextResponse.json({ locations: data });
}
