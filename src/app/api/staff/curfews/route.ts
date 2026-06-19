import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jsonError, parseBody } from "@/lib/api";
import { requireStaff, staffCanAccessHouse } from "@/lib/staff-auth";

/** Curfews for the houses this staff member can see. */
export async function GET() {
  const { staff, response } = await requireStaff();
  if (!staff) return response;

  const db = createSupabaseAdminClient();
  let q = db.from("curfews").select("id, house_id, year_group, back_by").order("year_group");
  if (staff.role !== "leadership") q = q.eq("house_id", staff.house_id!);

  const { data, error } = await q;
  if (error) return jsonError(500, "server_error", "Could not load curfews");
  // normalise Postgres "HH:MM:SS" -> "HH:MM"
  const curfews = (data ?? []).map((c) => ({ ...c, back_by: String(c.back_by).slice(0, 5) }));
  return NextResponse.json({ curfews });
}

const schema = z.object({
  houseId: z.string().uuid(),
  curfews: z
    .array(
      z.object({
        yearGroup: z.string().trim().min(1).max(20),
        backBy: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
      }),
    )
    .max(40),
});

/** Replace the curfew set for a house with the provided rows. */
export async function PUT(request: Request) {
  const { staff, response } = await requireStaff();
  if (!staff) return response;

  const { data, error } = await parseBody(request, schema);
  if (error) return error;
  if (!staffCanAccessHouse(staff, data.houseId)) {
    return jsonError(403, "wrong_house", "You can only manage your own house");
  }

  const db = createSupabaseAdminClient();
  // Replace wholesale: simplest correct semantics for an "edit the table" UI.
  const del = await db.from("curfews").delete().eq("house_id", data.houseId);
  if (del.error) return jsonError(500, "server_error", "Could not update curfews");

  if (data.curfews.length) {
    const rows = data.curfews.map((c) => ({
      house_id: data.houseId,
      year_group: c.yearGroup,
      back_by: c.backBy,
    }));
    const ins = await db.from("curfews").insert(rows);
    if (ins.error) {
      const dup = ins.error.code === "23505";
      return jsonError(
        dup ? 409 : 500,
        dup ? "duplicate_year" : "server_error",
        dup ? "Each year group can appear only once." : "Could not save curfews",
      );
    }
  }

  await db.from("audit_log").insert({
    house_id: data.houseId,
    actor_type: "staff",
    actor_id: staff.id,
    action: "curfews.updated",
    entity: "house",
    entity_id: data.houseId,
    meta: { count: data.curfews.length },
  });

  return NextResponse.json({ ok: true });
}
