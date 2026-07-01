import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, parseBody } from "@/lib/api";
import { createDb } from "@/lib/db";
import { requireSession } from "@/lib/session";

const schema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(255),
    auth: z.string().min(1).max(255),
  }),
});

export async function POST(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;
  const { data, error } = await parseBody(request, schema);
  if (error) return error;

  const db = createDb();
  const { error: dbError } = await db.from("push_subscriptions").upsert(
    {
      endpoint: data.endpoint,
      p256dh: data.keys.p256dh,
      auth: data.keys.auth,
      user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
    },
    { onConflict: "endpoint" },
  );
  if (dbError) return jsonError(500, "server_error", "Could not save subscription");
  return NextResponse.json({ ok: true });
}
