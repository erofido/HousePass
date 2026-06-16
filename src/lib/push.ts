import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Web Push sender. VAPID keys come from env; if they're absent, push is a
 * no-op (so the app runs fine before notifications are configured).
 */

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:alerts@housepass.app",
    pub,
    priv,
  );
  configured = true;
  return true;
}

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export interface PushPayload {
  title: string;
  body: string;
  /** path opened when the notification is tapped */
  url?: string;
  tag?: string;
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Send a payload to one subscriber's devices. Dead subscriptions (410/404)
 * are pruned. Returns how many devices were reached.
 */
export async function pushToSubscriber(
  db: SupabaseClient,
  subscriberType: "student" | "staff",
  subscriberId: string,
  payload: PushPayload,
): Promise<number> {
  if (!ensureConfigured()) return 0;

  const { data: subs } = await db
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("subscriber_type", subscriberType)
    .eq("subscriber_id", subscriberId)
    .returns<SubscriptionRow[]>();

  if (!subs || subs.length === 0) return 0;

  const body = JSON.stringify(payload);
  let delivered = 0;
  const dead: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        delivered++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.id);
      }
    }),
  );

  if (dead.length) {
    await db.from("push_subscriptions").delete().in("id", dead);
  }
  if (delivered) {
    await db
      .from("push_subscriptions")
      .update({ last_used_at: new Date().toISOString() })
      .eq("subscriber_type", subscriberType)
      .eq("subscriber_id", subscriberId);
  }
  return delivered;
}

/** Fan out one payload to every active staff member of a house. */
export async function pushToHouseStaff(
  db: SupabaseClient,
  houseId: string,
  payload: PushPayload,
): Promise<number> {
  const { data: staff } = await db
    .from("staff")
    .select("id")
    .eq("house_id", houseId)
    .eq("active", true);
  if (!staff || staff.length === 0) return 0;

  let total = 0;
  for (const s of staff) {
    total += await pushToSubscriber(db, "staff", s.id, payload);
  }
  return total;
}
