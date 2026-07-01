"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? "Something went wrong.");
        setBusy(false);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Network error — try again.");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm animate-rise">
        <p className="text-center text-xs font-semibold tracking-[0.35em] text-acc">
          31 → 42
        </p>
        <h1 className="mt-2 text-center text-4xl font-black tracking-tight">
          LOCK&nbsp;IN
        </h1>
        <p className="mt-2 text-center text-sm text-mut">
          One summer. Two months. No excuses.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-3">
          <input
            type="password"
            inputMode="text"
            autoFocus
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Passcode"
            className="w-full rounded-xl2 border border-line bg-panel px-4 py-3 text-center text-lg tracking-widest placeholder:text-mut/50"
          />
          <button
            type="submit"
            disabled={busy || !passcode}
            className="w-full rounded-xl2 bg-acc py-3 text-lg font-bold text-bg transition hover:brightness-110 disabled:opacity-40"
          >
            {busy ? "…" : "Enter the grind"}
          </button>
          {error && <p className="text-center text-sm text-danger">{error}</p>}
        </form>
      </div>
    </main>
  );
}
