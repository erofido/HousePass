import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jsonError } from "@/lib/api";
import { getStudentSession } from "@/lib/student-auth";

/** Destinations the student can pick from (their house + global). */
export async function GET() {
  const session = await getStudentSession();
  if (!session) return jsonError(401, "unauthenticated", "Sign in first");

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
