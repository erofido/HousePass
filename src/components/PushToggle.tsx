"use client";

import { useState } from "react";
import { useInitialLoad } from "@/hooks/useRealtime";
import { cn } from "@/lib/cn";

/**
 * Enable/disable Web Push for the signed-in student or staff member on this
 * device. Hidden entirely if push isn't configured (no public VAPID key) or
 * the browser can't do push. On iOS, push needs the app installed to the home
 * screen first — we detect that and explain.
 */

function urlBase64ToKey(base64: string): BufferSource {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "loading" | "unsupported" | "needs-install" | "off" | "on" | "denied" | "busy";

export function PushToggle({ tone = "light" }: { tone?: "light" | "dark" }) {
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);

  useInitialLoad(async () => {
    if (!vapid || typeof window === "undefined") {
      setState("unsupported");
      return;
    }
    const supported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    if (!supported) {
      // iOS < 16.4, or push only after install: detect standalone capability.
      const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      setState(iOS ? "needs-install" : "unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    } catch {
      setState("off");
    }
  });

  async function enable() {
    setError(null);
    setState("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToKey(vapid!),
      });
      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!res.ok) throw new Error("save failed");
      setState("on");
    } catch {
      setError("Couldn't turn on notifications — try again.");
      setState("off");
    }
  }

  async function disable() {
    setError(null);
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setError("Couldn't turn off notifications.");
      setState("on");
    }
  }

  if (state === "loading" || state === "unsupported") return null;

  const muted = tone === "dark" ? "text-paper/60" : "text-ink/60";

  if (state === "needs-install") {
    return (
      <p className={cn("text-xs", muted)}>
        🔔 To get reminders on iPhone, tap Share → <strong>Add to Home Screen</strong>, then open HousePass from there.
      </p>
    );
  }
  if (state === "denied") {
    return (
      <p className={cn("text-xs", muted)}>
        🔕 Notifications are blocked in your browser settings — allow them for this site to get reminders.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={state === "busy"}
        onClick={state === "on" ? disable : enable}
        className={cn(
          "inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
          state === "on"
            ? tone === "dark"
              ? "bg-ink-700 text-mint hover:bg-ink-600"
              : "bg-mint-100 text-teal-700 hover:bg-mint"
            : "bg-teal text-ink hover:bg-mint",
        )}
      >
        {state === "on" ? "🔔 Notifications on" : "🔔 Turn on notifications"}
      </button>
      {error && <p className="text-xs text-alert">{error}</p>}
    </div>
  );
}
