import { NextResponse } from "next/server";
import { createDb } from "@/lib/db";
import { requireSession } from "@/lib/session";

export async function GET() {
  const denied = await requireSession();
  if (denied) return denied;

  const db = createDb();
  const [tasks, subjects] = await Promise.all([
    db.from("tasks").select("*").order("sort"),
    db.from("subjects").select("*").order("sort"),
  ]);
  return NextResponse.json({
    tasks: tasks.data ?? [],
    subjects: subjects.data ?? [],
  });
}
