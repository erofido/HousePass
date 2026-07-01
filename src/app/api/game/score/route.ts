import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, parseBody } from "@/lib/api";
import { createDb } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { buildAchievementContext, loadCore, syncAchievements } from "@/lib/data";

const schema = z.object({ score: z.number().int().min(0).max(10_000) });

export async function POST(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;
  const { data, error } = await parseBody(request, schema);
  if (error) return error;

  const db = createDb();
  const core = await loadCore(db);
  if (data.score <= core.profile.best_snake) {
    return NextResponse.json({ best: core.profile.best_snake, newBest: false, newAchievements: [] });
  }

  const { error: updateError } = await db
    .from("profile")
    .update({ best_snake: data.score })
    .eq("id", core.profile.id);
  if (updateError) return jsonError(500, "server_error", updateError.message);

  core.profile.best_snake = data.score;
  const fresh = await syncAchievements(db, buildAchievementContext(core));
  return NextResponse.json({
    best: data.score,
    newBest: true,
    newAchievements: fresh.map((a) => ({ code: a.code, name: a.name, icon: a.icon })),
  });
}
