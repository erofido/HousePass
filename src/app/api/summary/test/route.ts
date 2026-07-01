import { NextResponse } from "next/server";
import { createDb } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { loadCore } from "@/lib/data";
import { sendDailySummary } from "@/lib/summary";

/** "Send today's report now" button in Settings — doesn't consume the nightly send. */
export async function POST() {
  const denied = await requireSession();
  if (denied) return denied;

  const db = createDb();
  const core = await loadCore(db);
  const result = await sendDailySummary(db, core);
  return NextResponse.json(result);
}
