import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { DB_ERROR_MESSAGES, isKnownDbCode } from "@/lib/db-errors";

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

export function dbErrorResponse(error: { message: string } | null): NextResponse {
  const code = error?.message ?? "unknown";
  if (isKnownDbCode(error)) return jsonError(409, code, DB_ERROR_MESSAGES[code]);
  console.error("Unexpected database error:", error);
  return jsonError(500, "server_error", "Something went wrong — try again.");
}
