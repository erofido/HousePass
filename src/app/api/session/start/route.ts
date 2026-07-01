import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, parseBody } from "@/lib/api";
import { createDb } from "@/lib/db";
import { requireSession } from "@/lib/session";

const schema = z.object({
  subjectId: z.string().uuid().nullable(),
  focus: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;
  const { data, error } = await parseBody(request, schema);
  if (error) return error;

  const db = createDb();
  const { data: row, error: dbError } = await db
    .from("sessions")
    .insert({
      subject_id: data.subjectId,
      focus: data.focus?.trim() || null,
    })
    .select("id, subject_id, focus, started_at")
    .single();

  if (dbError) {
    // Unique partial index: only one running timer.
    if (dbError.code === "23505") {
      return jsonError(409, "already_running", "A session is already running.");
    }
    return jsonError(500, "server_error", dbError.message);
  }
  return NextResponse.json({ session: row });
}
