import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jsonError, parseBody } from "@/lib/api";
import { requireStaff } from "@/lib/staff-auth";

const schema = z.object({
  email: z.string().trim().email(),
  fullName: z.string().trim().min(2).max(100),
  role: z.enum(["staff", "leadership"]),
  houseId: z.string().uuid().nullable().optional(),
});

/** Leadership: create a staff account (Supabase Auth user + staff row). */
export async function POST(request: Request) {
  const { staff, response } = await requireStaff({ leadership: true });
  if (!staff) return response;

  const { data, error } = await parseBody(request, schema);
  if (error) return error;
  if (data.role === "staff" && !data.houseId) {
    return jsonError(400, "invalid_input", "House staff need a house");
  }

  const db = createSupabaseAdminClient();
  const tempPassword = randomBytes(9).toString("base64url");

  const created = await db.auth.admin.createUser({
    email: data.email,
    password: tempPassword,
    email_confirm: true,
  });
  if (created.error) {
    return jsonError(
      409,
      "auth_create_failed",
      created.error.message.includes("already")
        ? "An account with that email already exists."
        : "Could not create the account.",
    );
  }

  const { data: row, error: dbError } = await db
    .from("staff")
    .insert({
      id: created.data.user.id,
      full_name: data.fullName,
      email: data.email,
      role: data.role,
      house_id: data.role === "leadership" ? (data.houseId ?? null) : data.houseId,
    })
    .select("id, full_name, email, role, house_id, active")
    .single();

  if (dbError) {
    // keep auth + staff in sync if the second step failed
    await db.auth.admin.deleteUser(created.data.user.id);
    return jsonError(500, "server_error", "Could not create the staff record");
  }

  await db.from("audit_log").insert({
    house_id: row.house_id,
    actor_type: "staff",
    actor_id: staff.id,
    action: "staff.created",
    entity: "staff",
    entity_id: row.id,
    meta: { role: row.role },
  });

  return NextResponse.json({ staff: row, tempPassword });
}
