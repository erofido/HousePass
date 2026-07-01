"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * The coach's daily briefing on the Today page. Hidden entirely when
 * ANTHROPIC_API_KEY isn't configured server-side.
 */
export function CoachCard() {
  const [briefing, setBriefing] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load(refresh = false) {
    setBusy(true);
    try {
      const res = await fetch(`/api/coach/briefing${refresh ? "?refresh=1" : ""}`);
      if (!res.ok) return;
      const body = await res.json();
      setConfigured(body.configured);
      setBriefing(body.briefing);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, []);

  if (!configured) return null;

  return (
    <section className="animate-rise rounded-xl2 border border-line bg-panel p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-bold tracking-widest text-mut">🧠 COACH&apos;S BRIEFING</h2>
        <div className="flex gap-3">
          <button
            onClick={() => load(true)}
            disabled={busy}
            className="text-xs text-mut hover:text-txt disabled:opacity-40"
            title="Regenerate"
          >
            ↻
          </button>
          <Link href="/coach" className="text-xs font-semibold text-acc">
            ask the coach →
          </Link>
        </div>
      </div>
      {briefing ? (
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{briefing}</p>
      ) : (
        <p className="mt-2 animate-pulse text-sm text-mut">
          {busy ? "Coach is reading your numbers…" : "No briefing yet — hit ↻."}
        </p>
      )}
    </section>
  );
}
