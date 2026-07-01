import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

/**
 * Single-user auth: a passcode (STUDY_PASSCODE) unlocks a long-lived signed
 * HttpOnly cookie. No accounts, no database round-trip to verify.
 */

export const SESSION_COOKIE = "lockin_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 90; // the whole summer and then some

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env("SESSION_SECRET"));
}

export function passcodeMatches(attempt: string): boolean {
  const expected = env("STUDY_PASSCODE");
  const a = Buffer.from(attempt);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Compare anyway against self to keep timing flat.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ kind: "study" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_MAX_AGE)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload.kind === "study";
  } catch {
    return false;
  }
}

export async function hasSession(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  return verifySessionToken(token);
}

/** For API routes: null when authenticated, a 401 Response otherwise. */
export async function requireSession(): Promise<Response | null> {
  if (await hasSession()) return null;
  return Response.json(
    { error: { code: "unauthorized", message: "Sign in first" } },
    { status: 401 },
  );
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}
