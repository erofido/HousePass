import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Service-role client. Bypasses RLS — server-side only, never import
 * from client components. Used by the station/student API routes and
 * cron jobs, which authenticate callers themselves.
 */
export function createSupabaseAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("The Supabase admin client must never run in the browser");
  }
  return createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
