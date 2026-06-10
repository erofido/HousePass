import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

/**
 * HousePass-signed sessions for the two principals that do NOT get Supabase
 * credentials: students (phone app) and office stations (kiosk iPad).
 * Both only ever talk to our own API routes, which act via the service role.
 */

export const STUDENT_COOKIE = "hp_student";
export const STATION_COOKIE = "hp_station";

export const STUDENT_SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
export const STATION_SESSION_MAX_AGE = 60 * 60 * 24 * 365; // re-pair yearly

export type SessionKind = "student" | "station";

export interface SessionPayload {
  kind: SessionKind;
  /** student id or station id */
  id: string;
  houseId: string;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env("SESSION_SECRET"));
}

export async function createSessionToken(
  payload: SessionPayload,
  maxAgeSeconds: number,
): Promise<string> {
  return new SignJWT({ kind: payload.kind, hid: payload.houseId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.id)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + maxAgeSeconds)
    .sign(secretKey());
}

export async function verifySessionToken(
  token: string,
  kind: SessionKind,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.kind !== kind || !payload.sub || !payload.hid) return null;
    return { kind, id: payload.sub, houseId: String(payload.hid) };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
