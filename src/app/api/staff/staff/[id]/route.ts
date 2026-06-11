import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jsonError, parseBody } from "@/lib/api";
import { requireStaff } from "@/lib/staff-auth";

const schema = z.object({
  active: z.boolean(),
});

/** Leadership: deactivate / reactivate a staff account. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { staff, response } = await requireStaff({ leadership: true });
  if (!staff) return response;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return jsonError(400, "invalid_input", "Bad staff id");
  }
  if (id === staff.id) {
    return jsonError(400, "self_change", "You cannot deactivate your own account");
  }
  const { data, error } = await parseBody(request, schema);
  if (error) return error;

  const db = createSupabaseAdminClient();
  const { data: row, error: dbError } = await db
    .from("staff")
    .update({ active: data.active })
    .eq("id", id)
    .select("id, house_id")
    .maybeSingle();

  if (dbError) return jsonError(500, "server_error", "Could not update");
  if (!row) return jsonError(404, "not_found", "Staff member not found");

  await db.from("audit_log").insert({
    house_id: row.house_id,
    actor_type: "staff",
    actor_id: staff.id,
    action: data.active ? "staff.reactivated" : "staff.deactivated",
    entity: "staff",
    entity_id: id,
  });

  return NextResponse.json({ ok: true });
}
