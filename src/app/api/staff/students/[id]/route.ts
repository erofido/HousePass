import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomBytes, randomInt } from "node:crypto";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jsonError, parseBody } from "@/lib/api";
import { requireStaff, staffCanAccessHouse } from "@/lib/staff-auth";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reset_pin") }),
  z.object({ action: z.literal("regenerate_qr") }),
  z.object({ action: z.literal("set_active"), active: z.boolean() }),
]);

/** Sensitive student updates: PIN reset, QR rotation, (de)activation. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { staff, response } = await requireStaff();
  if (!staff) return response;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return jsonError(400, "invalid_input", "Bad student id");
  }
  const { data, error } = await parseBody(request, schema);
  if (error) return error;

  const db = createSupabaseAdminClient();
  const { data: student } = await db
    .from("students")
    .select("id, house_id, full_name")
    .eq("id", id)
    .maybeSingle();
  if (!student || !staffCanAccessHouse(staff, student.house_id)) {
    return jsonError(404, "not_found", "Student not found");
  }

  const audit = (action: string) =>
    db.from("audit_log").insert({
      house_id: student.house_id,
      actor_type: "staff",
      actor_id: staff.id,
      action,
      entity: "student",
      entity_id: student.id,
    });

  if (data.action === "reset_pin") {
    const pin = String(randomInt(0, 10000)).padStart(4, "0");
    const { error: e } = await db
      .from("students")
      .update({
        pin_hash: bcrypt.hashSync(pin, 10),
        failed_pin_attempts: 0,
        locked_until: null,
      })
      .eq("id", id);
    if (e) return jsonError(500, "server_error", "Could not reset the PIN");
    await audit("student.pin_reset");
    return NextResponse.json({ pin });
  }

  if (data.action === "regenerate_qr") {
    // Reissue the whole pass: new lookup token AND new rotating secret, and
    // reset the replay counter. Any old screenshot/device is invalidated.
    const { error: e } = await db
      .from("students")
      .update({
        qr_token: randomBytes(20).toString("hex"),
        qr_secret: randomBytes(20).toString("hex"),
        last_qr_step: 0,
      })
      .eq("id", id);
    if (e) return jsonError(500, "server_error", "Could not regenerate the pass");
    await audit("student.qr_regenerated");
    return NextResponse.json({ ok: true });
  }

  // set_active
  const { error: e } = await db
    .from("students")
    .update({ active: data.active })
    .eq("id", id);
  if (e) return jsonError(500, "server_error", "Could not update the student");
  await audit(data.active ? "student.reactivated" : "student.deactivated");
  return NextResponse.json({ ok: true });
}
