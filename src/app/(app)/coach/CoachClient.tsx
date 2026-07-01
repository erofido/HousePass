"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

const STARTERS = [
  "Plan my next session",
  "Explain vectors like I'm getting a 4",
  "Quiz me on stoichiometry",
  "How do I structure a 15-mark GloPo essay?",
  "Roast my progress",
];

/**
 * Ask the coach anything. It sees the live stats (subjects, minutes, streak,
 * pending tasks) on every question, so its plans are grounded, not generic.
 */
export function CoachClient() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unconfigured, setUnconfigured] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setError(null);
    setInput("");
    const next: Turn[] = [...turns, { role: "user", content: question }];
    setTurns(next);
    setBusy(true);
    try {
      const res = await fetch("/api/coach/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-8) }),
      });
      if (res.status === 503) {
        setUnconfigured(true);
        return;
      }
      if (!res.ok) {
        setError("The coach didn't answer — try again.");
        return;
      }
      const body = await res.json();
      setTurns([...next, { role: "assistant", content: body.answer }]);
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (unconfigured) {
    return (
      <div className="rounded-xl2 border border-line bg-panel p-5 text-sm text-mut">
        🧠 The coach needs an <code className="text-txt">ANTHROPIC_API_KEY</code> on the
        server. Add it in Vercel (see README), redeploy, and come back.
      </div>
    );
  }

  return (
    <div className="flex min-h-[70vh] flex-col">
      {turns.length === 0 && (
        <div className="animate-rise">
          <h1 className="text-2xl font-black">The Coach 🧠</h1>
          <p className="mt-1 text-sm text-mut">
            Knows your real numbers — minutes, streak, weak topics, what&apos;s left on
            the plan. Ask for a plan, an explanation, a quiz, or a reality check.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {STARTERS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-xl border border-line bg-panel px-3 py-2 text-sm text-mut transition hover:text-txt"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 space-y-3 py-4">
        {turns.map((t, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[85%] whitespace-pre-line rounded-xl2 px-4 py-3 text-sm leading-relaxed",
              t.role === "user"
                ? "ml-auto bg-acc/15 border border-acc/30"
                : "bg-panel border border-line",
            )}
          >
            {t.content}
          </div>
        ))}
        {busy && (
          <div className="max-w-[85%] rounded-xl2 border border-line bg-panel px-4 py-3 text-sm text-mut">
            <span className="animate-pulse">Coach is thinking…</span>
          </div>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="sticky bottom-16 flex gap-2 bg-bg pb-2 pt-1 sm:bottom-0"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the coach…"
          maxLength={4000}
          className="flex-1 rounded-xl2 border border-line bg-panel px-4 py-3 text-sm placeholder:text-mut/50"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-xl2 bg-acc px-5 py-3 text-sm font-bold text-bg transition hover:brightness-110 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
