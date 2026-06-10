import { cookies } from "next/headers";
import {
  STATION_COOKIE,
  verifySessionToken,
  type SessionPayload,
} from "@/lib/session";

/** Resolve the station session cookie, or null when this device isn't paired. */
export async function getStationSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(STATION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token, "station");
}
