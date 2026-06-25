"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { BrandLockup } from "@/components/Brand";
import { ErrorNotice, Spinner } from "@/components/Notice";

export default function StaffLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(
        error.message === "Invalid login credentials"
          ? "Email or password incorrect."
          : error.message,
      );
      setBusy(false);
      return;
    }
    router.replace("/staff");
    router.refresh();
  }

  return (
    <div className="flex flex-1 items-center justify-center surface-ink px-4 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-3 text-center">
          <BrandLockup dark className="justify-center" />
          <h1 className="text-2xl font-semibold text-paper">Staff sign in</h1>
          <p className="text-sm text-paper/60">
            House staff and leadership dashboard
          </p>
        </div>

        <form
          onSubmit={submit}
          className="space-y-4 rounded-2xl bg-paper p-6 shadow-lift animate-rise"
        >
          <label className="block text-sm font-medium">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2.5 text-base"
            />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2.5 text-base"
            />
          </label>

          <ErrorNotice>{error}</ErrorNotice>

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal px-4 py-2.5 font-medium text-ink transition-colors hover:bg-mint disabled:opacity-60"
          >
            {busy && <Spinner />} Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
