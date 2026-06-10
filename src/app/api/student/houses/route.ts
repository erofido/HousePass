import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** House names for the student login picker. Names only, nothing sensitive. */
export async function GET() {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("houses").select("id, name").order("name");
  if (error) {
    return NextResponse.json(
      { error: { code: "server_error", message: "Could not load houses" } },
      { status: 500 },
    );
  }
  return NextResponse.json({ houses: data });
}
