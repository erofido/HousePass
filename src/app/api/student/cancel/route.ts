import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { dbErrorResponse, jsonError, parseBody } from "@/lib/api";
import { getStudentSession } from "@/lib/student-auth";

const schema = z.object({ outingId: z.string().uuid() });

/** Cancel one of your own not-yet-departed requests. */
export async function POST(request: Request) {
  const session = await getStudentSession();
  if (!session) return jsonError(401, "unauthenticated", "Sign in first");

  const { data, error } = await parseBody(request, schema);
  if (error) return error;

  const db = createSupabaseAdminClient();
  const { data: outing, error: dbError } = await db.rpc("app_student_cancel", {
    p_student_id: session.id,
    p_outing_id: data.outingId,
  });

  if (dbError) return dbErrorResponse(dbError);
  return NextResponse.json({ outing });
}
