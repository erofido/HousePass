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

/**
 * The state-machine functions raise exceptions whose MESSAGE is a stable
 * machine code (e.g. 'already_out'). Postgrest surfaces that as err.message.
 */
const DB_ERROR_MESSAGES: Record<string, string> = {
  already_out: "Already signed out — sign back in first.",
  no_open_outing: "No open sign-out found — already signed in.",
  not_approved: "This outing has not been approved yet.",
  not_requested: "This request has already been handled.",
  invalid_state: "That action does not fit the outing's current state.",
  not_found: "Not found.",
  not_staff: "Your account is not registered as staff.",
  student_not_found: "Student not found.",
  location_not_found: "That destination is not available.",
  destination_required: "Pick a destination.",
  expected_back_required: "A due-back time is required.",
};

export function dbErrorResponse(error: { message: string } | null): NextResponse {
  const code = error?.message ?? "unknown";
  const friendly = DB_ERROR_MESSAGES[code];
  if (friendly) return jsonError(409, code, friendly);
  console.error("Unexpected database error:", error);
  return jsonError(500, "server_error", "Something went wrong — try again.");
}

export function isKnownDbError(error: { message: string } | null): boolean {
  return !!error && error.message in DB_ERROR_MESSAGES;
}
