import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, parseBody } from "@/lib/api";
import { createDb } from "@/lib/db";
import { ensureSeeded } from "@/lib/plan";
import {
  createSessionToken,
  passcodeMatches,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/session";

const schema = z.object({ passcode: z.string().min(1).max(200) });

/** Naive in-memory brake on guessing; resets on redeploy, good enough for one user. */
let failures = 0;
let lockedUntil = 0;

export async function POST(request: Request) {
  const { data, error } = await parseBody(request, schema);
  if (error) return error;

  if (Date.now() < lockedUntil) {
    return jsonError(429, "locked", "Too many attempts — wait a minute.");
  }

  if (!passcodeMatches(data.passcode)) {
    failures++;
    if (failures >= 5) {
      lockedUntil = Date.now() + 60_000;
      failures = 0;
    }
    return jsonError(401, "bad_passcode", "Wrong passcode.");
  }
  failures = 0;

  // First successful login seeds the whole summer plan.
  await ensureSeeded(createDb());

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    SESSION_COOKIE,
    await createSessionToken(),
    sessionCookieOptions(),
  );
  return response;
}
