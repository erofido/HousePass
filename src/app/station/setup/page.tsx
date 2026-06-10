"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLockup } from "@/components/Brand";
import { ErrorNotice, Spinner } from "@/components/Notice";

export default function StationSetupPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/station/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Pairing failed — try again.");
        setBusy(false);
        return;
      }
      router.replace("/station");
      router.refresh();
    } catch {
      setError("Can't reach HousePass — check the iPad's connection.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-ink px-6 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="space-y-3 text-center">
          <BrandLockup dark className="justify-center" />
          <h1 className="text-3xl font-semibold text-paper">
            Pair this office station
          </h1>
          <p className="text-paper/60">
            Enter this house&apos;s station token. It was shown when the
            station was created (seed output, or Staff → Manage → Station).
            This is done once per iPad.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="space-y-4 rounded-2xl bg-paper p-6 shadow-card"
        >
          <label className="block text-sm font-medium">
            Station token
            <input
              type="text"
              required
              autoComplete="off"
              spellCheck={false}
              placeholder="hpst_…"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-3 font-mono text-sm"
            />
          </label>

          <ErrorNotice>{error}</ErrorNotice>

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal px-4 py-3 text-lg font-medium text-ink transition-colors hover:bg-mint disabled:opacity-60"
          >
            {busy && <Spinner />} Pair station
          </button>
        </form>
      </div>
    </div>
  );
}
