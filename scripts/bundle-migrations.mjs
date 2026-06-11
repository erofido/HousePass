/** Bundle supabase/migrations/*.sql into one paste-able file. */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const parts = [
  `-- HousePass: all migrations in one file (for the Supabase SQL editor).
-- Generated from supabase/migrations/ — do not edit by hand; run
-- \`npm run migrations:bundle\` after changing a migration.
-- Safe to run once on a fresh project.\n`,
];
for (const f of files) {
  parts.push(`\n-- ============================== ${f} ==============================\n`);
  parts.push(readFileSync(join(dir, f), "utf8"));
}

writeFileSync(join(process.cwd(), "supabase", "all_migrations.sql"), parts.join(""));
console.log(`✓ supabase/all_migrations.sql (${files.length} migrations bundled)`);
