import { NextResponse } from "next/server";
import { createDb } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { loadCore } from "@/lib/data";
import { aiConfigured } from "@/lib/ai";
import { getBriefing } from "@/lib/coach";

/** Today's coach briefing (cached per day). ?refresh=1 regenerates. */
export async function GET(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  if (!aiConfigured()) {
    return NextResponse.json({ configured: false, briefing: null });
  }

  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  const db = createDb();
  const core = await loadCore(db);
  const briefing = await getBriefing(db, core, refresh);
  return NextResponse.json({ configured: true, briefing, day: core.today });
}
