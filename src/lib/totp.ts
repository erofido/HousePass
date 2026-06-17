import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Rotating QR codes, server side. The phone computes the same code from the
 * student's secret and the current time-step; we verify against OUR clock so a
 * tampered device clock can never forge a valid code. A small ±1 step window
 * absorbs honest clock drift and scan latency.
 *
 * Code = first 4 bytes of HMAC-SHA256(secret, step) as hex (8 chars), where
 * step = floor(unixSeconds / periodSeconds). The browser (Web Crypto) and
 * Node produce identical output for the same inputs.
 */

export const QR_PERIOD_SECONDS = Math.max(
  2,
  Number(process.env.QR_PERIOD_SECONDS) || 5,
);

export function currentStep(periodSeconds = QR_PERIOD_SECONDS, nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000 / periodSeconds);
}

export function codeForStep(secretHex: string, step: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  return createHmac("sha256", Buffer.from(secretHex, "hex"))
    .update(msg)
    .digest()
    .subarray(0, 4)
    .toString("hex");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/**
 * Verify a presented code. Accepts the current step and ±1, but only steps
 * strictly newer than `lastStep` (replay protection). Returns the matched
 * step so the caller can persist it as the new `lastStep`.
 */
export function verifyRotatingCode(
  secretHex: string,
  code: string,
  lastStep: number,
  periodSeconds = QR_PERIOD_SECONDS,
  nowMs = Date.now(),
): { ok: true; step: number } | { ok: false } {
  if (!/^[0-9a-f]{8}$/.test(code)) return { ok: false };
  const s = currentStep(periodSeconds, nowMs);
  // newest first so the persisted lastStep advances as far as possible
  for (const step of [s + 1, s, s - 1]) {
    if (step <= lastStep) continue;
    if (constantTimeEqual(codeForStep(secretHex, step), code)) {
      return { ok: true, step };
    }
  }
  return { ok: false };
}

/** Parse a kiosk scan payload "HP2:<qr_token>:<code>". */
export function parseRotatingPayload(
  payload: string,
): { token: string; code: string } | null {
  if (!payload.startsWith("HP2:")) return null;
  const parts = payload.slice(4).split(":");
  if (parts.length !== 2) return null;
  const [token, code] = parts;
  if (!token || !code) return null;
  return { token, code };
}

/**
 * Verify a station code presented by a phone. Unlike the student pass we do
 * NOT consume the step — the station code is shared by everyone scanning that
 * screen, so single-use would block the queue. Freshness (current ±1 step)
 * is what proves "you were at the screen just now".
 */
export function verifyStationCode(
  secretHex: string,
  code: string,
  periodSeconds = QR_PERIOD_SECONDS,
  nowMs = Date.now(),
): boolean {
  return verifyRotatingCode(secretHex, code, 0, periodSeconds, nowMs).ok;
}

/** Parse a station scan payload "HPK:<station_id>:<code>". */
export function parseStationPayload(
  payload: string,
): { stationId: string; code: string } | null {
  if (!payload.startsWith("HPK:")) return null;
  const parts = payload.slice(4).split(":");
  if (parts.length !== 2) return null;
  const [stationId, code] = parts;
  if (!stationId || !code) return null;
  return { stationId, code };
}
