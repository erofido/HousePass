import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api";
import { createDb } from "@/lib/db";
import { requireSession } from "@/lib/session";

const schema = z.object({ endpoint: z.string().url().max(1000) });

export async function POST(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;
  const { data, error } = await parseBody(request, schema);
  if (error) return error;

  const db = createDb();
  await db.from("push_subscriptions").delete().eq("endpoint", data.endpoint);
  return NextResponse.json({ ok: true });
}
