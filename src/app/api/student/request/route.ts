import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { dbErrorResponse, jsonError, parseBody } from "@/lib/api";
import { getStudentSession } from "@/lib/student-auth";

const schema = z
  .object({
    locationId: z.string().uuid().optional(),
    locationText: z.string().trim().max(120).optional(),
    expectedBackAt: z.string().datetime({ offset: true }),
    note: z.string().trim().max(300).optional(),
  })
  .refine((v) => v.locationId || (v.locationText && v.locationText.length >= 2), {
    message: "Pick a destination or describe one",
  });

/**
 * Request an outing ahead of time. Self-service destinations auto-approve
 * (ready at the kiosk); permission ones land on the staff approvals queue.
 */
export async function POST(request: Request) {
  const session = await getStudentSession();
  if (!session) return jsonError(401, "unauthenticated", "Sign in first");

  const { data, error } = await parseBody(request, schema);
  if (error) return error;

  const db = createSupabaseAdminClient();
  const { data: outing, error: dbError } = await db.rpc("app_create_request", {
    p_student_id: session.id,
    p_location_id: data.locationId ?? null,
    p_location_text: data.locationText ?? null,
    p_expected_back_at: data.expectedBackAt,
    p_note: data.note ?? null,
    p_actor_type: "student",
    p_actor_id: session.id,
  });

  if (dbError) return dbErrorResponse(dbError);
  return NextResponse.json({ outing });
}
