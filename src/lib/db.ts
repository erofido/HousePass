import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Service-role client — the only database principal this app uses.
 * Server-side only; the browser never receives database credentials.
 */
export function createDb(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("The service-role client must never run in the browser");
  }
  return createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
