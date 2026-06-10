import { cookies } from "next/headers";
import {
  STUDENT_COOKIE,
  verifySessionToken,
  type SessionPayload,
} from "@/lib/session";

/** Resolve the student session cookie, or null when not signed in. */
export async function getStudentSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(STUDENT_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token, "student");
}
