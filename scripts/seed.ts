/**
 * CLI seeding (same logic as the /api/setup page — see src/lib/seed-data.ts).
 *
 * Usage:  npm run seed     (reads .env.local / .env)
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { migrationsApplied, runSeed } from "../src/lib/seed-data";

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

async function main() {
  console.log(`Seeding at ${url}\n`);

  if (!(await migrationsApplied(db))) {
    console.error(
      "The HousePass tables don't exist yet — apply supabase/all_migrations.sql " +
        "(SQL editor) or `supabase db push` first.",
    );
    process.exit(1);
  }

  const result = await runSeed(db, {
    houseName: process.env.SEED_HOUSE_NAME,
    staffEmail: process.env.SEED_STAFF_EMAIL,
    staffPassword: process.env.SEED_STAFF_PASSWORD,
    leadershipEmail: process.env.SEED_LEADERSHIP_EMAIL,
    leadershipPassword: process.env.SEED_LEADERSHIP_PASSWORD,
  });

  for (const line of result.log) console.log(`• ${line}`);

  console.log("\n──────────────────── CREDENTIALS (store safely) ────────────────────");
  if (result.staff.length) {
    console.log("\nStaff logins (email / password):");
    for (const c of result.staff) {
      console.log(`  ${c.role.padEnd(10)} ${c.email}  /  ${c.password}`);
    }
  }
  if (result.stationToken) {
    console.log(`\nStation token (enter once on the office iPad):\n  ${result.stationToken}`);
  }
  if (result.students.length) {
    console.log("\nStudent PINs:");
    for (const c of result.students) {
      console.log(`  ${c.name.padEnd(18)} room ${c.room.padEnd(3)} ${c.year.padEnd(4)} PIN ${c.pin}`);
    }
  }
  if (!result.createdAnything) {
    console.log("\nNothing new to create — credentials are only shown on first run.");
  }
  console.log("\nDone. QR pass cards: Staff → Manage → Students → Print QR cards.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
