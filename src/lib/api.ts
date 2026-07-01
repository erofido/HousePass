import { NextResponse } from "next/server";
import type { ZodType } from "zod";

/** Stable error envelope: { error: { code, message } } */
export function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function parseBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<{ data: T; error: null } | { data: null; error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { data: null, error: jsonError(400, "bad_json", "Body must be JSON") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      data: null,
      error: jsonError(
        400,
        "invalid_input",
        first ? `${first.path.join(".") || "body"}: ${first.message}` : "Invalid input",
      ),
    };
  }
  return { data: parsed.data, error: null };
}

/** Cron endpoints require Authorization: Bearer CRON_SECRET. */
export function requireCron(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return jsonError(500, "cron_unconfigured", "CRON_SECRET is not set");
  }
  const header = request.headers.get("authorization") ?? "";
  if (header !== `Bearer ${secret}`) {
    return jsonError(401, "unauthorized", "Bad or missing cron secret");
  }
  return null;
}
