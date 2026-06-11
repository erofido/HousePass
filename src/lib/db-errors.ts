/**
 * The state-machine functions raise exceptions whose MESSAGE is a stable
 * machine code (e.g. 'already_out'); PostgREST surfaces it as error.message.
 * Shared by server routes and the staff dashboard (client) alike.
 */
export const DB_ERROR_MESSAGES: Record<string, string> = {
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

export function friendlyDbMessage(error: { message: string } | null): string {
  if (!error) return "Something went wrong — try again.";
  return DB_ERROR_MESSAGES[error.message] ?? error.message;
}

export function isKnownDbCode(error: { message: string } | null): boolean {
  return !!error && error.message in DB_ERROR_MESSAGES;
}
