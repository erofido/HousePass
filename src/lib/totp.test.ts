import { describe, expect, it } from "vitest";
import { codeForStep, currentStep, verifyRotatingCode } from "@/lib/totp";

// Replicate exactly what the browser component (PassQr) does, using the same
// Web Crypto API (available as globalThis.crypto in Node). If this matches the
// server's codeForStep, the phone and kiosk agree.
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
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
async function browserCode(secretHex: string, step: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    hexToBytes(secretHex) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, stepMessage(step) as BufferSource),
  );
  return [...sig.subarray(0, 4)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

const SECRET = "0a1b2c3d4e5f60718293a4b5c6d7e8f900112233";

describe("rotating QR codes", () => {
  it("server and browser derive identical codes", async () => {
    for (const step of [0, 1, 1000, currentStep(5), 999999999]) {
      expect(await browserCode(SECRET, step)).toBe(codeForStep(SECRET, step));
    }
  });

  it("accepts a fresh code and advances the replay counter", () => {
    const step = currentStep(5);
    const code = codeForStep(SECRET, step);
    const r = verifyRotatingCode(SECRET, code, 0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.step).toBe(step);
  });

  it("rejects replay of an already-used (or older) step", () => {
    const step = currentStep(5);
    const code = codeForStep(SECRET, step);
    // lastStep already at this step -> reused code refused
    expect(verifyRotatingCode(SECRET, code, step).ok).toBe(false);
  });

  it("rejects a wrong / random code", () => {
    expect(verifyRotatingCode(SECRET, "deadbeef", 0).ok).toBe(false);
    expect(verifyRotatingCode(SECRET, "zzzzzzzz", 0).ok).toBe(false);
  });

  it("tolerates ±1 step of clock skew but no more", () => {
    const now = Date.now();
    const ahead = codeForStep(SECRET, currentStep(5, now) + 1);
    const behind = codeForStep(SECRET, currentStep(5, now) - 1);
    const tooOld = codeForStep(SECRET, currentStep(5, now) - 5);
    expect(verifyRotatingCode(SECRET, ahead, 0, 5, now).ok).toBe(true);
    expect(verifyRotatingCode(SECRET, behind, 0, 5, now).ok).toBe(true);
    expect(verifyRotatingCode(SECRET, tooOld, 0, 5, now).ok).toBe(false);
  });
});
