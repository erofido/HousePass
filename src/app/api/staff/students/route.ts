import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomBytes, randomInt } from "node:crypto";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jsonError, parseBody } from "@/lib/api";
import { requireStaff, staffCanAccessHouse } from "@/lib/staff-auth";
import { STUDENT_COLUMNS } from "@/lib/types";

const schema = z.object({
  houseId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(100),
  room: z.string().trim().max(20).optional(),
  yearGroup: z.string().trim().max(20).optional(),
});

/** Create a student. PIN is generated here, hashed, and returned exactly once. */
export async function POST(request: Request) {
  const { staff, response } = await requireStaff();
  if (!staff) return response;

  const { data, error } = await parseBody(request, schema);
  if (error) return error;

  if (!staffCanAccessHouse(staff, data.houseId)) {
    return jsonError(403, "wrong_house", "You can only manage your own house");
  }

  const pin = String(randomInt(0, 10000)).padStart(4, "0");
  const db = createSupabaseAdminClient();
  const { data: student, error: dbError } = await db
    .from("students")
    .insert({
      house_id: data.houseId,
      full_name: data.fullName,
      room: data.room || null,
      year_group: data.yearGroup || null,
      pin_hash: bcrypt.hashSync(pin, 10),
      qr_token: randomBytes(20).toString("hex"),
    })
    .select(STUDENT_COLUMNS)
    .single();

  if (dbError) return jsonError(500, "server_error", "Could not create the student");

  await db.from("audit_log").insert({
    house_id: data.houseId,
    actor_type: "staff",
    actor_id: staff.id,
    action: "student.created",
    entity: "student",
    entity_id: student.id,
  });

  return NextResponse.json({ student, pin });
}
