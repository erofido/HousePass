import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jsonError } from "@/lib/api";
import { requireStation } from "@/lib/station-auth";

/** This house's active students, for the "tap your name" picker. */
export async function GET() {
  const { session, response } = await requireStation();
  if (!session) return response;

  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("students")
    .select("id, full_name, room, year_group, status")
    .eq("house_id", session.houseId)
    .eq("active", true)
    .order("full_name");

  if (error) return jsonError(500, "server_error", "Could not load students");
  return NextResponse.json({ students: data });
}
