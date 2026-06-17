"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { cn } from "@/lib/cn";

/**
 * A QR that silently rotates: it encodes `${prefix}${id}:${code}` where code =
 * first 4 bytes of HMAC-SHA256(secret, time-step), recomputed each second from
 * server-synced time. Used for the student pass (prefix "HP2:") and the office
 * station code (prefix "HPK:"). No visible timer — to a user it's just a code.
 */

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

function stepMessage(step: number): Uint8Array {
  const msg = new Uint8Array(8);
  let v = BigInt(step);
  for (let i = 7; i >= 0; i--) {
    msg[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return msg;
}

export function RotatingQr({
  prefix,
  id,
  secret,
  period,
  serverOffsetMs,
  size = 480,
  className,
}: {
  prefix: string;
  id: string;
  secret: string;
  period: number;
  serverOffsetMs: number;
  size?: number;
  className?: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let key: CryptoKey | null = null;
    let lastPayload = "";

    async function tick() {
      try {
        if (!key) {
          key = await crypto.subtle.importKey(
            "raw",
            hexToBytes(secret) as BufferSource,
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"],
          );
        }
        const now = Date.now() + serverOffsetMs;
        const step = Math.floor(now / 1000 / period);
        const sig = new Uint8Array(
          await crypto.subtle.sign("HMAC", key, stepMessage(step) as BufferSource),
        );
        const payload = `${prefix}${id}:${bytesToHex(sig.subarray(0, 4))}`;
        if (payload === lastPayload) return;
        lastPayload = payload;
        const url = await QRCode.toDataURL(payload, {
          width: size,
          margin: 1,
          color: { dark: "#0c1422", light: "#ffffff" },
        });
        if (!cancelled) setDataUrl(url);
      } catch {
        /* transient; next tick retries */
      }
    }

    tick();
    const timer = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [prefix, id, secret, period, serverOffsetMs, size]);

  if (!dataUrl) {
    return (
      <div
        className={cn("aspect-square animate-pulse rounded-xl bg-ink/5", className)}
        style={{ width: size }}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={dataUrl} alt="HousePass code" className={cn("rounded-xl", className)} />
  );
}
