import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseBody } from "@/lib/api";

const schema = z.object({ endpoint: z.string().url().max(1000) });

/** Drop a device subscription (called when the user turns notifications off). */
export async function POST(request: Request) {
  const { data, error } = await parseBody(request, schema);
  if (error) return error;

  const db = createSupabaseAdminClient();
  await db.from("push_subscriptions").delete().eq("endpoint", data.endpoint);
  return NextResponse.json({ ok: true });
}
