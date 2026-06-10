import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jsonError, parseBody } from "@/lib/api";
import {
  createSessionToken,
  sessionCookieOptions,
  STUDENT_COOKIE,
  STUDENT_SESSION_MAX_AGE,
} from "@/lib/session";

const schema = z.object({
  houseId: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  pin: z.string().regex(/^\d{4}$/, "PIN is 4 digits"),
  /** only needed when two students share a name and a PIN guess matches both */
  room: z.string().trim().max(20).optional(),
});

export async function POST(request: Request) {
  const { data, error } = await parseBody(request, schema);
  if (error) return error;

  const db = createSupabaseAdminClient();

  let query = db
    .from("students")
    .select("id, house_id, full_name, room, year_group, status, pin_hash, locked_until")
    .eq("house_id", data.houseId)
    .eq("active", true)
    .ilike("full_name", data.name);
  if (data.room) query = query.ilike("room", data.room);

  const { data: candidates, error: dbError } = await query;
  if (dbError) return jsonError(500, "server_error", "Could not check your details");

  // Same response for "no such name" and "wrong PIN": don't leak the roll.
  const wrongDetails = () =>
    jsonError(401, "wrong_details", "Name or PIN incorrect — check with the office if stuck.");

  if (!candidates || candidates.length === 0) return wrongDetails();

  const now = Date.now();
  const unlocked = candidates.filter(
    (c) => !c.locked_until || new Date(c.locked_until).getTime() <= now,
  );
  if (unlocked.length === 0) {
    const until = Math.max(...candidates.map((c) => new Date(c.locked_until!).getTime()));
    const minutes = Math.max(1, Math.ceil((until - now) / 60000));
    return jsonError(
      423,
      "locked",
      `Too many wrong PINs. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    );
  }

  const matches = unlocked.filter((c) => bcrypt.compareSync(data.pin, c.pin_hash));

  if (matches.length === 0) {
    await db.rpc("app_pin_attempt", {
      p_candidate_ids: unlocked.map((c) => c.id),
      p_success_id: null,
    });
    return wrongDetails();
  }

  if (matches.length > 1) {
    // Two students with the same name AND the same PIN: ask for the room.
    return jsonError(
      409,
      "ambiguous",
      "More than one student matches — add your room number to continue.",
    );
  }

  const student = matches[0];
  await db.rpc("app_pin_attempt", {
    p_candidate_ids: [student.id],
    p_success_id: student.id,
  });

  const token = await createSessionToken(
    { kind: "student", id: student.id, houseId: student.house_id },
    STUDENT_SESSION_MAX_AGE,
  );
  const store = await cookies();
  store.set(STUDENT_COOKIE, token, sessionCookieOptions(STUDENT_SESSION_MAX_AGE));

  return NextResponse.json({
    student: {
      id: student.id,
      full_name: student.full_name,
      room: student.room,
      year_group: student.year_group,
      status: student.status,
    },
  });
}
