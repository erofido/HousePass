import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomBytes, randomInt } from "node:crypto";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jsonError, parseBody } from "@/lib/api";
import { requireStaff, staffCanAccessHouse } from "@/lib/staff-auth";

const schema = z.object({
  houseId: z.string().uuid(),
  students: z
    .array(
      z.object({
        fullName: z.string().trim().min(2).max(100),
        room: z.string().trim().max(20).optional(),
        yearGroup: z.string().trim().max(20).optional(),
      }),
    )
    .min(1)
    .max(300),
});

/**
 * Create many students at once. Each gets a generated 4-digit PIN and QR
 * token; the PINs are returned once for printing. Best-effort per row so one
 * bad row doesn't sink the batch — the response reports what was created.
 */
export async function POST(request: Request) {
  const { staff, response } = await requireStaff();
  if (!staff) return response;

  const { data, error } = await parseBody(request, schema);
  if (error) return error;
  if (!staffCanAccessHouse(staff, data.houseId)) {
    return jsonError(403, "wrong_house", "You can only manage your own house");
  }

  const db = createSupabaseAdminClient();
  const created: { fullName: string; room: string | null; yearGroup: string | null; pin: string }[] = [];
  const failed: { fullName: string; reason: string }[] = [];

  for (const s of data.students) {
    const pin = String(randomInt(0, 10000)).padStart(4, "0");
    const { error: insErr } = await db.from("students").insert({
      house_id: data.houseId,
      full_name: s.fullName,
      room: s.room || null,
      year_group: s.yearGroup || null,
      pin_hash: bcrypt.hashSync(pin, 10),
      qr_token: randomBytes(20).toString("hex"),
    });
    if (insErr) {
      failed.push({ fullName: s.fullName, reason: "could not be created" });
    } else {
      created.push({ fullName: s.fullName, room: s.room || null, yearGroup: s.yearGroup || null, pin });
    }
  }

  if (created.length > 0) {
    await db.from("audit_log").insert({
      house_id: data.houseId,
      actor_type: "staff",
      actor_id: staff.id,
      action: "student.bulk_imported",
      entity: "house",
      entity_id: data.houseId,
      meta: { created: created.length, failed: failed.length },
    });
  }

  return NextResponse.json({ created, failed });
}
