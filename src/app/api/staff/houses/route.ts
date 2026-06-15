import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { jsonError, parseBody } from "@/lib/api";
import { requireStaff } from "@/lib/staff-auth";

/** Leadership: every house, with a quick count of active students. */
export async function GET() {
  const { staff, response } = await requireStaff({ leadership: true });
  if (!staff) return response;

  const db = createSupabaseAdminClient();
  const { data: houses, error } = await db
    .from("houses")
    .select("id, name, created_at")
    .order("name");
  if (error) return jsonError(500, "server_error", "Could not load houses");

  // student counts per house (one cheap grouped read)
  const { data: students } = await db
    .from("students")
    .select("house_id")
    .eq("active", true);
  const counts = new Map<string, number>();
  for (const s of students ?? []) {
    counts.set(s.house_id, (counts.get(s.house_id) ?? 0) + 1);
  }

  return NextResponse.json({
    houses: (houses ?? []).map((h) => ({ ...h, studentCount: counts.get(h.id) ?? 0 })),
  });
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

/** Leadership: add a boarding house. */
export async function POST(request: Request) {
  const { staff, response } = await requireStaff({ leadership: true });
  if (!staff) return response;

  const { data, error } = await parseBody(request, createSchema);
  if (error) return error;

  const db = createSupabaseAdminClient();
  const { data: house, error: dbError } = await db
    .from("houses")
    .insert({ name: data.name })
    .select("id, name, created_at")
    .single();

  if (dbError) {
    const duplicate = dbError.message.includes("duplicate") || dbError.code === "23505";
    return jsonError(
      duplicate ? 409 : 500,
      duplicate ? "duplicate" : "server_error",
      duplicate ? "A house with that name already exists." : "Could not create the house",
    );
  }

  await db.from("audit_log").insert({
    house_id: house.id,
    actor_type: "staff",
    actor_id: staff.id,
    action: "house.created",
    entity: "house",
    entity_id: house.id,
    meta: { name: house.name },
  });

  return NextResponse.json({ house: { ...house, studentCount: 0 } });
}
