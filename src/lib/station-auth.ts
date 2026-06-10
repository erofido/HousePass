import { cookies } from "next/headers";
import { jsonError } from "@/lib/api";
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

/** Route-handler guard: a session, or the 401 to return as-is. */
export async function requireStation() {
  const session = await getStationSession();
  if (!session) {
    return {
      session: null,
      response: jsonError(401, "station_unpaired", "This device is not paired as a station"),
    } as const;
  }
  return { session, response: null } as const;
}
