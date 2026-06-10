/**
 * Seed a Supabase project with pilot data for one house:
 *   - Heron House
 *   - 10 students (two share a name, to exercise disambiguation) with
 *     random 4-digit PINs and QR tokens
 *   - locations (self-service + permission-required + one global)
 *   - one house staff login and one leadership login (Supabase Auth)
 *   - one office-station token for the house iPad
 *
 * Idempotent: existing rows (matched by natural keys) are left alone, so
 * re-running only prints credentials for things it just created.
 *
 * Usage:  npm run seed     (reads .env.local / .env)
 */
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { readFileSync } from "node:fs";

// -- tiny .env loader (no dependency) ---------------------------------------
for (const file of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* file absent is fine */
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. in .env.local) first.",
  );
  process.exit(1);
}

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const HOUSE_NAME = process.env.SEED_HOUSE_NAME || "Heron House";

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

const STAFF = [
  {
    email: process.env.SEED_STAFF_EMAIL || "duty.heron@example.com",
    name: "Dan Mercer",
    role: "staff" as const,
    password: process.env.SEED_STAFF_PASSWORD,
  },
  {
    email: process.env.SEED_LEADERSHIP_EMAIL || "deputy.head@example.com",
    name: "Sarah Whitcombe",
    role: "leadership" as const,
    password: process.env.SEED_LEADERSHIP_PASSWORD,
  },
];

function fail(step: string, error: { message: string } | null): never {
  console.error(`Seed failed at ${step}: ${error?.message ?? "unknown error"}`);
  process.exit(1);
}

async function main() {
  console.log(`Seeding "${HOUSE_NAME}" at ${url}\n`);

  // House -------------------------------------------------------------------
  let { data: house } = await db.from("houses").select("*").eq("name", HOUSE_NAME).maybeSingle();
  if (!house) {
    const res = await db.from("houses").insert({ name: HOUSE_NAME }).select().single();
    if (res.error) fail("houses", res.error);
    house = res.data;
    console.log(`✓ Created house: ${HOUSE_NAME}`);
  } else {
    console.log(`• House exists: ${HOUSE_NAME}`);
  }

  // Locations ----------------------------------------------------------------
  for (const loc of LOCATIONS) {
    const houseId = loc.global ? null : house.id;
    const q = db.from("locations").select("id").ilike("name", loc.name);
    const { data: existing } = await (houseId
      ? q.eq("house_id", houseId)
      : q.is("house_id", null)
    ).maybeSingle();
    if (existing) continue;
    const res = await db.from("locations").insert({
      house_id: houseId,
      name: loc.name,
      requires_permission: loc.requiresPermission,
    });
    if (res.error) fail(`location ${loc.name}`, res.error);
    console.log(
      `✓ Location: ${loc.name}${loc.global ? " (global)" : ""}${loc.requiresPermission ? " — needs permission" : ""}`,
    );
  }

  // Students ------------------------------------------------------------------
  const studentCreds: { name: string; room: string; year: string; pin: string }[] = [];
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
    if (res.error) fail(`student ${s.name}`, res.error);
    studentCreds.push({ ...s, pin });
  }
  console.log(
    studentCreds.length
      ? `✓ Created ${studentCreds.length} students`
      : "• Students already present",
  );

  // Staff (Supabase Auth + staff row) ------------------------------------------
  const staffCreds: { email: string; password: string; role: string }[] = [];
  for (const m of STAFF) {
    const { data: existing } = await db.from("staff").select("id").eq("email", m.email).maybeSingle();
    if (existing) {
      console.log(`• Staff exists: ${m.email}`);
      continue;
    }
    const password = m.password || randomBytes(9).toString("base64url");
    const created = await db.auth.admin.createUser({
      email: m.email,
      password,
      email_confirm: true,
    });
    if (created.error) fail(`auth user ${m.email}`, created.error);
    const res = await db.from("staff").insert({
      id: created.data.user.id,
      full_name: m.name,
      email: m.email,
      role: m.role,
      house_id: m.role === "leadership" ? null : house.id,
    });
    if (res.error) fail(`staff ${m.email}`, res.error);
    staffCreds.push({ email: m.email, password, role: m.role });
    console.log(`✓ Staff (${m.role}): ${m.email}`);
  }

  // Station token ---------------------------------------------------------------
  let stationToken: string | null = null;
  const { data: station } = await db
    .from("stations")
    .select("id")
    .eq("house_id", house.id)
    .maybeSingle();
  if (!station) {
    stationToken = `hpst_${randomBytes(24).toString("hex")}`;
    const res = await db.from("stations").insert({
      house_id: house.id,
      name: `${HOUSE_NAME} office iPad`,
      token_hash: createHash("sha256").update(stationToken).digest("hex"),
    });
    if (res.error) fail("station", res.error);
    console.log("✓ Station registered");
  } else {
    console.log("• Station exists (token only shown when first created)");
  }

  // Credentials summary -----------------------------------------------------------
  console.log("\n──────────────────────── CREDENTIALS (store safely) ───────────────────────");
  if (staffCreds.length) {
    console.log("\nStaff logins (email / password):");
    for (const c of staffCreds) console.log(`  ${c.role.padEnd(10)} ${c.email}  /  ${c.password}`);
  }
  if (stationToken) {
    console.log(`\nStation token (enter once on the office iPad):\n  ${stationToken}`);
  }
  if (studentCreds.length) {
    console.log("\nStudent PINs:");
    for (const c of studentCreds) {
      console.log(`  ${c.name.padEnd(18)} room ${c.room.padEnd(3)} ${c.year.padEnd(4)} PIN ${c.pin}`);
    }
  }
  console.log("\nDone. QR code cards can be printed from Staff → Manage → Students.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
