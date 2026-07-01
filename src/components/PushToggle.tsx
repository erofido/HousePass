"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Enable/disable the nag notifications on this device. Hidden when push
 * isn't configured. On iPhone the app must be added to the Home Screen
 * before push works (Apple's rule) — detected and explained.
 */

function urlBase64ToKey(base64: string): BufferSource {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State =
  | "loading"
  | "unsupported"
  | "needs-install"
  | "off"
  | "on"
  | "denied"
  | "busy";

export function PushToggle() {
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!vapid || typeof window === "undefined") {
        if (!cancelled) setState("unsupported");
        return;
      }
      const supported =
        "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!supported) {
        const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
        if (!cancelled) setState(iOS ? "needs-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setState(sub ? "on" : "off");
      } catch {
        if (!cancelled) setState("off");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vapid]);

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

  if (state === "needs-install") {
    return (
      <p className="text-xs text-mut">
        🔔 For the nags to reach your iPhone: Share → <strong>Add to Home Screen</strong>,
        then open Lock In from there and come back here.
      </p>
    );
  }
  if (state === "denied") {
    return (
      <p className="text-xs text-mut">
        🔕 Notifications are blocked in browser settings — allow them for this
        site if you actually want to be pissed off into studying.
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
          "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50",
          state === "on"
            ? "bg-panel-2 text-acc border border-line"
            : "bg-acc text-bg hover:brightness-110",
        )}
      >
        {state === "on" ? "🔔 Nags armed" : "🔔 Arm the nags"}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
