"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * The student's rotating pass. Derives a short code from their secret and the
 * current time-step (synced to server time, not the device clock) and redraws
 * the QR when the code changes — every `period` seconds. To the student it's
 * just their pass; there's no visible timer. The office verifies the code
 * server-side, so a screenshot is dead within one window.
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

export function PassQr({
  token,
  secret,
  period,
  serverOffsetMs,
}: {
  token: string;
  secret: string;
  period: number;
  serverOffsetMs: number;
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
        const payload = `HP2:${token}:${bytesToHex(sig.subarray(0, 4))}`;
        if (payload === lastPayload) return; // code unchanged this tick
        lastPayload = payload;
        const url = await QRCode.toDataURL(payload, {
          width: 480,
          margin: 1,
          color: { dark: "#0c1422", light: "#ffffff" },
        });
        if (!cancelled) setDataUrl(url);
      } catch {
        /* transient; next tick retries */
      }
    }

    tick();
    // check ~once a second so the visible code is never more than a moment
    // behind a step boundary (server accepts ±1 step of slack anyway)
    const timer = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token, secret, period, serverOffsetMs]);

  if (!dataUrl) {
    return <div className="mx-auto mt-3 aspect-square w-56 animate-pulse rounded-xl bg-ink/5" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={dataUrl}
      alt="Your HousePass pass"
      className="mx-auto mt-3 w-56 max-w-full rounded-xl"
    />
  );
}
