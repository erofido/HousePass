import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, parseBody } from "@/lib/api";
import { createDb } from "@/lib/db";
import { requireSession } from "@/lib/session";

const vacation = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label: z.string().max(60).optional(),
});

const schema = z.object({
  daily_goal_minutes: z.number().int().min(30).max(720).optional(),
  parent_email: z.string().email().nullable().optional(),
  user_email: z.string().email().nullable().optional(),
  nag_intensity: z.enum(["mild", "firm", "brutal"]).optional(),
  vacations: z.array(vacation).max(10).optional(),
});

export async function PATCH(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;
  const { data, error } = await parseBody(request, schema);
  if (error) return error;

  for (const v of data.vacations ?? []) {
    if (v.end < v.start) {
      return jsonError(400, "invalid_input", "Vacation end is before its start");
    }
  }

  const db = createDb();
  const { data: profile } = await db.from("profile").select("id").limit(1).single();
  if (!profile) return jsonError(404, "not_found", "Profile missing — log in again");

  const { error: updateError } = await db
    .from("profile")
    .update(data)
    .eq("id", profile.id);
  if (updateError) return jsonError(500, "server_error", updateError.message);
  return NextResponse.json({ ok: true });
}
