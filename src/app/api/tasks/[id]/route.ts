import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, parseBody } from "@/lib/api";
import { createDb } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { buildAchievementContext, loadCore, syncAchievements } from "@/lib/data";

const schema = z.object({ done: z.boolean() });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireSession();
  if (denied) return denied;
  const { data, error } = await parseBody(request, schema);
  if (error) return error;
  const { id } = await params;

  const db = createDb();
  const { data: task, error: taskError } = await db
    .from("tasks")
    .select("id, xp, done")
    .eq("id", id)
    .maybeSingle();
  if (taskError || !task) return jsonError(404, "not_found", "No such task");
  if (task.done === data.done) return NextResponse.json({ ok: true, xpDelta: 0, newAchievements: [] });

  const { error: updateError } = await db
    .from("tasks")
    .update({ done: data.done, done_at: data.done ? new Date().toISOString() : null })
    .eq("id", id);
  if (updateError) return jsonError(500, "server_error", updateError.message);

  // Ticking a task earns its XP; unticking hands it back.
  const xpDelta = data.done ? task.xp : -task.xp;
  const core = await loadCore(db);
  const newXp = Math.max(0, core.profile.xp + xpDelta);
  await db.from("profile").update({ xp: newXp }).eq("id", core.profile.id);

  const fresh = data.done
    ? await syncAchievements(db, buildAchievementContext(core))
    : [];

  return NextResponse.json({
    ok: true,
    xpDelta,
    xp: newXp,
    newAchievements: fresh.map((a) => ({ code: a.code, name: a.name, icon: a.icon })),
  });
}
