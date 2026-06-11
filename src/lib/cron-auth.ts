import { jsonError } from "@/lib/api";

/**
 * Cron endpoints are unauthenticated infrastructure hooks; they require the
 * shared CRON_SECRET (Authorization: Bearer <secret>). Works with Supabase
 * Cron + pg_net, GitHub Actions schedules, Vercel Cron, or plain curl.
 */
export function requireCron(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return jsonError(500, "cron_unconfigured", "CRON_SECRET is not set");
  }
  const header = request.headers.get("authorization") ?? "";
  if (header !== `Bearer ${secret}`) {
    return jsonError(401, "unauthorized", "Bad or missing cron secret");
  }
  return null;
}
