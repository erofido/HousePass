import { NextResponse } from "next/server";
import { createDb } from "@/lib/db";
import { requireSession } from "@/lib/session";

/** Discard the running timer without crediting anything. */
export async function POST() {
  const denied = await requireSession();
  if (denied) return denied;

  const db = createDb();
  await db.from("sessions").delete().is("ended_at", null);
  return NextResponse.json({ ok: true });
}
