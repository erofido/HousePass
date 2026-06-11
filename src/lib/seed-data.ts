import type { SupabaseClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { createHash, randomBytes, randomInt } from "node:crypto";

/**
 * Pilot seed, shared by the CLI script (scripts/seed.ts) and the one-time
 * /api/setup endpoint. Idempotent: existing rows (matched by natural keys)
 * are left alone, so credentials are only returned for newly created things.
 */

export interface SeedResult {
  houseName: string;
  createdAnything: boolean;
  staff: { email: string; password: string; role: string; name: string }[];
  students: { name: string; room: string; year: string; pin: string }[];
  stationToken: string | null;
  log: string[];
}

const LOCATIONS: { name: string; requiresPermission: boolean; global?: boolean }[] = [
  { name: "Town", requiresPermission: true, global: true },
  { name: "Sports Hall", requiresPermission: false },
  { name: "Music School", requiresPermission: false },
  { name: "Library", requiresPermission: false },
  { name: "Astro / Pitches", requiresPermission: false },
  { name: "Another house (visit)", requiresPermission: false },
  { name: "Off-site / Trip", requiresPermission: true },
];

const STUDENTS: { name: string; room: string; year: string }[] = [
  { name: "Oliver Hart", room: "3", year: "Y9" },
  { name: "Oliver Hart", room: "11", year: "Y12" }, // same name on purpose
  { name: "Amelia Brook", room: "5", year: "Y10" },
  { name: "Noah Patel", room: "8", year: "Y11" },
  { name: "Isla Chen", room: "2", year: "Y9" },
  { name: "George Okafor", room: "15", year: "Y13" },
  { name: "Freya Lindqvist", room: "9", year: "Y10" },
  { name: "Arthur Bellamy", room: "6", year: "Y12" },
  { name: "Maya Rahman", room: "1", year: "Y11" },
  { name: "Tom Whitfield", room: "12", year: "Y13" },
];

class SeedError extends Error {
  constructor(step: string, detail?: string) {
    super(`Seed failed at ${step}${detail ? `: ${detail}` : ""}`);
  }
}

export async function runSeed(
  db: SupabaseClient,
  opts: {
    houseName?: string;
    staffEmail?: string;
    staffPassword?: string;
    leadershipEmail?: string;
    leadershipPassword?: string;
  } = {},
): Promise<SeedResult> {
  const houseName = opts.houseName || "Heron House";
  const result: SeedResult = {
    houseName,
    createdAnything: false,
    staff: [],
    students: [],
    stationToken: null,
    log: [],
  };

  // House ---------------------------------------------------------------
  let { data: house } = await db.from("houses").select("*").eq("name", houseName).maybeSingle();
  if (!house) {
    const res = await db.from("houses").insert({ name: houseName }).select().single();
    if (res.error) throw new SeedError("houses", res.error.message);
    house = res.data;
    result.createdAnything = true;
    result.log.push(`Created house: ${houseName}`);
  } else {
    result.log.push(`House exists: ${houseName}`);
  }

  // Locations -------------------------------------------------------------
  for (const loc of LOCATIONS) {
    const houseId = loc.global ? null : house.id;
    const q = db.from("locations").select("id").ilike("name", loc.name);
    const { data: existing } = await (houseId ? q.eq("house_id", houseId) : q.is("house_id", null)).maybeSingle();
    if (existing) continue;
    const res = await db.from("locations").insert({
      house_id: houseId,
      name: loc.name,
      requires_permission: loc.requiresPermission,
    });
    if (res.error) throw new SeedError(`location ${loc.name}`, res.error.message);
    result.createdAnything = true;
    result.log.push(`Location: ${loc.name}${loc.requiresPermission ? " (needs permission)" : ""}`);
  }

  // Students ----------------------------------------------------------------
  for (const s of STUDENTS) {
    const { data: existing } = await db
      .from("students")
      .select("id")
      .eq("house_id", house.id)
      .eq("full_name", s.name)
      .eq("room", s.room)
      .maybeSingle();
    if (existing) continue;

    const pin = String(randomInt(0, 10000)).padStart(4, "0");
    const res = await db.from("students").insert({
      house_id: house.id,
      full_name: s.name,
      room: s.room,
      year_group: s.year,
      pin_hash: bcrypt.hashSync(pin, 10),
      qr_token: randomBytes(20).toString("hex"),
    });
    if (res.error) throw new SeedError(`student ${s.name}`, res.error.message);
    result.createdAnything = true;
    result.students.push({ ...s, pin });
  }
  if (result.students.length) result.log.push(`Created ${result.students.length} students`);

  // Staff (Supabase Auth + staff row) -------------------------------------------
  const staffSeeds = [
    {
      email: opts.staffEmail || "duty.heron@example.com",
      name: "Dan Mercer",
      role: "staff" as const,
      password: opts.staffPassword,
    },
    {
      email: opts.leadershipEmail || "deputy.head@example.com",
      name: "Sarah Whitcombe",
      role: "leadership" as const,
      password: opts.leadershipPassword,
    },
  ];

  for (const m of staffSeeds) {
    const { data: existing } = await db.from("staff").select("id").eq("email", m.email).maybeSingle();
    if (existing) {
      result.log.push(`Staff exists: ${m.email}`);
      continue;
    }
    const password = m.password || randomBytes(9).toString("base64url");
    const created = await db.auth.admin.createUser({
      email: m.email,
      password,
      email_confirm: true,
    });
    if (created.error) throw new SeedError(`auth user ${m.email}`, created.error.message);
    const res = await db.from("staff").insert({
      id: created.data.user.id,
      full_name: m.name,
      email: m.email,
      role: m.role,
      house_id: m.role === "leadership" ? null : house.id,
    });
    if (res.error) throw new SeedError(`staff ${m.email}`, res.error.message);
    result.createdAnything = true;
    result.staff.push({ email: m.email, password, role: m.role, name: m.name });
    result.log.push(`Staff (${m.role}): ${m.email}`);
  }

  // Station token -----------------------------------------------------------------
  const { data: station } = await db.from("stations").select("id").eq("house_id", house.id).maybeSingle();
  if (!station) {
    const token = `hpst_${randomBytes(24).toString("hex")}`;
    const res = await db.from("stations").insert({
      house_id: house.id,
      name: `${houseName} office iPad`,
      token_hash: createHash("sha256").update(token).digest("hex"),
    });
    if (res.error) throw new SeedError("station", res.error.message);
    result.createdAnything = true;
    result.stationToken = token;
    result.log.push("Station registered");
  } else {
    result.log.push("Station exists (token only shown when first created)");
  }

  return result;
}

/** Quick probe: do the HousePass tables exist yet? */
export async function migrationsApplied(db: SupabaseClient): Promise<boolean> {
  const { error } = await db.from("houses").select("id", { head: true, count: "exact" });
  return !error;
}
