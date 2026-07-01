import Anthropic from "@anthropic-ai/sdk";

/**
 * Thin Claude wrapper. When ANTHROPIC_API_KEY is unset every AI feature
 * degrades gracefully (canned nags, no briefing card, no coach verdict) —
 * the app never depends on it to function.
 */

const MODEL = "claude-opus-4-8";

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** One completion; null when unconfigured or the call fails. */
export async function askClaude(opts: {
  system: string;
  messages: ChatTurn[];
  maxTokens?: number;
}): Promise<string | null> {
  if (!aiConfigured()) return null;
  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: opts.messages,
    });
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return text || null;
  } catch (e) {
    console.error("Claude call failed:", e);
    return null;
  }
}
