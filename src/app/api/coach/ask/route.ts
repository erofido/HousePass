import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, parseBody } from "@/lib/api";
import { createDb } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { loadCore } from "@/lib/data";
import { aiConfigured } from "@/lib/ai";
import { coachChat } from "@/lib/coach";

const schema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(12),
});

export async function POST(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  if (!aiConfigured()) {
    return jsonError(503, "ai_not_configured", "Set ANTHROPIC_API_KEY to enable the coach.");
  }

  const { data, error } = await parseBody(request, schema);
  if (error) return error;
  if (data.messages[data.messages.length - 1].role !== "user") {
    return jsonError(400, "invalid_input", "Last message must be from you.");
  }

  const core = await loadCore(createDb());
  const answer = await coachChat(core, data.messages);
  if (!answer) {
    return jsonError(502, "ai_failed", "The coach didn't answer — try again.");
  }
  return NextResponse.json({ answer });
}
