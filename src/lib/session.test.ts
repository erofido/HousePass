import { beforeAll, describe, expect, it } from "vitest";
import {
  createSessionToken,
  verifySessionToken,
} from "@/lib/session";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-test-secret-test-secret!";
});

describe("session tokens", () => {
  const payload = {
    kind: "student" as const,
    id: "11111111-1111-1111-1111-111111111111",
    houseId: "22222222-2222-2222-2222-222222222222",
  };

  it("round-trips a valid token", async () => {
    const token = await createSessionToken(payload, 60);
    const verified = await verifySessionToken(token, "student");
    expect(verified).toEqual(payload);
  });

  it("rejects a token of the wrong kind (student cookie can't drive the kiosk)", async () => {
    const token = await createSessionToken(payload, 60);
    expect(await verifySessionToken(token, "station")).toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await createSessionToken(payload, -10);
    expect(await verifySessionToken(token, "student")).toBeNull();
  });

  it("rejects a tampered token", async () => {
    const token = await createSessionToken(payload, 60);
    const [h, p, s] = token.split(".");
    const forged = `${h}.${p}x.${s}`;
    expect(await verifySessionToken(forged, "student")).toBeNull();
    expect(await verifySessionToken(`${h}.${p}.`, "student")).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createSessionToken(payload, 60);
    process.env.SESSION_SECRET = "another-secret-another-secret-another!";
    expect(await verifySessionToken(token, "student")).toBeNull();
    process.env.SESSION_SECRET = "test-secret-test-secret-test-secret!";
  });
});
