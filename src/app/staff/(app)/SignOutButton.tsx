"use client";

import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await createSupabaseBrowserClient().auth.signOut();
        router.replace("/staff/login");
        router.refresh();
      }}
      className="rounded-lg px-3 py-1.5 text-sm text-paper/70 transition-colors hover:bg-ink-700 hover:text-paper"
    >
      Sign out
    </button>
  );
}
