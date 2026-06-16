import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jsonError, parseBody } from "@/lib/api";
import { getStudentSession } from "@/lib/student-auth";
import { requireStaff } from "@/lib/staff-auth";

const schema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(255),
    auth: z.string().min(1).max(255),
  }),
});

/**
 * Register this device's push subscription for the current student or staff
 * member. Whoever is signed in (student cookie or staff Supabase session) is
 * the owner — no cross-account subscriptions possible.
 */
export async function POST(request: Request) {
  const { data, error } = await parseBody(request, schema);
  if (error) return error;

  // Identify caller: student cookie first, else staff session.
  const student = await getStudentSession();
  let subscriberType: "student" | "staff";
  let subscriberId: string;
  let houseId: string | null;

  if (student) {
    subscriberType = "student";
    subscriberId = student.id;
    houseId = student.houseId;
  } else {
    const { staff, response } = await requireStaff();
    if (!staff) return response;
    subscriberType = "staff";
    subscriberId = staff.id;
    houseId = staff.house_id;
  }

  const db = createSupabaseAdminClient();
  // Upsert by endpoint: re-subscribing the same device just refreshes owner.
  const { error: dbError } = await db.from("push_subscriptions").upsert(
    {
      subscriber_type: subscriberType,
      subscriber_id: subscriberId,
      house_id: houseId,
      endpoint: data.endpoint,
      p256dh: data.keys.p256dh,
      auth: data.keys.auth,
      user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (dbError) return jsonError(500, "server_error", "Could not save subscription");
  return NextResponse.json({ ok: true });
}
