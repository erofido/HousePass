import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jsonError, parseBody } from "@/lib/api";
import { requireStaff } from "@/lib/staff-auth";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
});

/** Leadership: rename a house. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { staff, response } = await requireStaff({ leadership: true });
  if (!staff) return response;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return jsonError(400, "invalid_input", "Bad house id");
  }
  const { data, error } = await parseBody(request, schema);
  if (error) return error;

  const db = createSupabaseAdminClient();
  const { data: row, error: dbError } = await db
    .from("houses")
    .update({ name: data.name })
    .eq("id", id)
    .select("id, name")
    .maybeSingle();

  if (dbError) {
    const duplicate = dbError.message.includes("duplicate") || dbError.code === "23505";
    return jsonError(
      duplicate ? 409 : 500,
      duplicate ? "duplicate" : "server_error",
      duplicate ? "A house with that name already exists." : "Could not rename the house",
    );
  }
  if (!row) return jsonError(404, "not_found", "House not found");

  await db.from("audit_log").insert({
    house_id: id,
    actor_type: "staff",
    actor_id: staff.id,
    action: "house.renamed",
    entity: "house",
    entity_id: id,
    meta: { name: data.name },
  });

  return NextResponse.json({ ok: true });
}
