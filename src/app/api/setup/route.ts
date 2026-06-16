import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { migrationsApplied, runSeed, type SeedResult } from "@/lib/seed-data";

/**
 * One-time browser setup for non-technical installs:
 *
 *   https://<your-app>/api/setup?key=<CRON_SECRET>
 *
 * Applies the pilot seed (idempotent) and shows the generated credentials
 * ONCE, plus ready-to-paste SQL for scheduling the background jobs.
 * Guarded by the same secret as the cron endpoints.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = process.env.CRON_SECRET;
  const provided =
    url.searchParams.get("key") ??
    (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");

  if (!secret) {
    return page(500, "Setup unavailable", `<p>The <code>CRON_SECRET</code> environment variable is not set on this deployment. Add it in Vercel → Settings → Environment Variables, redeploy, then try again.</p>`);
  }
  if (provided !== secret) {
    return page(401, "Not authorised", `<p>Open this page as <code>/api/setup?key=&lt;your CRON_SECRET&gt;</code> — the same value you set in the environment variables.</p>`);
  }

  const db = createSupabaseAdminClient();

  if (!(await migrationsApplied(db))) {
    return page(
      409,
      "Database not ready yet",
      `<p>The HousePass tables don't exist in your Supabase project yet.</p>
       <ol>
         <li>Open your Supabase project → <strong>SQL Editor → New query</strong>.</li>
         <li>Paste the whole of <code>supabase/all_migrations.sql</code> from the repository and press <strong>Run</strong>.</li>
         <li>Reload this page.</li>
       </ol>`,
    );
  }

  let result: SeedResult;
  try {
    result = await runSeed(db);
  } catch (e) {
    return page(
      500,
      "Seeding hit a problem",
      `<p>${escapeHtml(e instanceof Error ? e.message : "Unknown error")}</p>
       <p>Reload to retry — already-created items are skipped, nothing is duplicated.</p>`,
    );
  }

  const cronSql = cronSnippet(url.origin, secret);

  if (!result.createdAnything) {
    return page(
      200,
      "Already set up",
      `<p><strong>${escapeHtml(result.houseName)}</strong> is already seeded — credentials are only shown when first created.</p>
       <p>Locked out? Staff → Manage can reset student PINs and rotate the station token; staff passwords can be reset from the Supabase Auth dashboard.</p>
       ${cronSection(cronSql)}
       ${linksSection(url.origin)}`,
    );
  }

  const staffRows = result.staff
    .map(
      (s) =>
        `<tr><td>${escapeHtml(s.name)} <small>(${s.role})</small></td><td><code>${escapeHtml(s.email)}</code></td><td><code>${escapeHtml(s.password)}</code></td></tr>`,
    )
    .join("");
  const studentRows = result.students
    .map(
      (s) =>
        `<tr><td>${escapeHtml(s.name)}</td><td>Rm ${escapeHtml(s.room)} · ${escapeHtml(s.year)}</td><td><code>${s.pin}</code></td></tr>`,
    )
    .join("");

  return page(
    200,
    `${escapeHtml(result.houseName)} is ready`,
    `<div class="warn"><strong>Save this page now</strong> (print or screenshot) — these credentials are shown only once.</div>

     ${result.staff.length ? `<h2>Staff logins → <code>/staff/login</code></h2>
     <table><tr><th>Who</th><th>Email</th><th>Password</th></tr>${staffRows}</table>` : ""}

     ${result.stationToken ? `<h2>Office iPad pairing token → <code>/station/setup</code></h2>
     <p><code class="block">${result.stationToken}</code></p>` : ""}

     ${result.students.length ? `<h2>Student PINs → <code>/student</code></h2>
     <table><tr><th>Student</th><th>Room / Year</th><th>PIN</th></tr>${studentRows}</table>` : ""}

     ${cronSection(cronSql)}
     ${linksSection(url.origin)}`,
  );
}

function cronSnippet(origin: string, secret: string): string {
  return `create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('housepass-notifications', '*/2 * * * *', $$
  select net.http_post(
    url     := '${origin}/api/cron/notifications',
    headers := jsonb_build_object('Authorization', 'Bearer ${secret}')
  );
$$);

select cron.schedule('housepass-late-alerts', '*/5 * * * *', $$
  select net.http_post(
    url     := '${origin}/api/cron/late-alerts',
    headers := jsonb_build_object('Authorization', 'Bearer ${secret}')
  );
$$);

select cron.schedule('housepass-retention', '10 4 * * *', $$
  select net.http_post(
    url     := '${origin}/api/cron/retention',
    headers := jsonb_build_object('Authorization', 'Bearer ${secret}')
  );
$$);`;
}

function cronSection(sql: string): string {
  return `<h2>Last step: schedule the background jobs</h2>
  <p>Copy this into your Supabase <strong>SQL Editor</strong> and run it once
  (push reminders every 2 minutes, late-alert emails every 5 minutes, data
  retention nightly):</p>
  <pre>${escapeHtml(sql)}</pre>`;
}

function linksSection(origin: string): string {
  return `<h2>Open the surfaces</h2>
  <ul>
    <li>Staff dashboard: <a href="${origin}/staff">${origin}/staff</a></li>
    <li>Office iPad: <a href="${origin}/station/setup">${origin}/station/setup</a></li>
    <li>Student app: <a href="${origin}/student">${origin}/student</a></li>
  </ul>`;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function page(status: number, title: string, body: string): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · HousePass setup</title>
<style>
  body{font-family:ui-sans-serif,system-ui,sans-serif;background:#0c1422;color:#fbfcfe;margin:0;padding:2rem 1rem}
  main{max-width:760px;margin:0 auto;background:#14202f;border-radius:20px;padding:2rem}
  h1{font-family:Georgia,serif;margin-top:0}
  h2{font-family:Georgia,serif;font-size:1.1rem;margin:1.8rem 0 .5rem;color:#7fe9d8}
  table{width:100%;border-collapse:collapse;font-size:.92rem}
  td,th{text-align:left;padding:.45rem .6rem;border-bottom:1px solid rgba(251,252,254,.12)}
  th{color:rgba(251,252,254,.55);font-weight:600}
  code{background:#1d2c3f;padding:.12rem .4rem;border-radius:6px;font-size:.9em}
  code.block{display:block;padding:.7rem;word-break:break-all}
  pre{background:#1d2c3f;padding:1rem;border-radius:12px;overflow-x:auto;font-size:.8rem;line-height:1.5}
  .warn{background:rgba(243,201,105,.15);border:1px solid rgba(243,201,105,.5);color:#f3c969;padding:.8rem 1rem;border-radius:12px}
  a{color:#16b6a6}
  small{color:rgba(251,252,254,.55)}
</style></head>
<body><main><h1>${escapeHtml(title)}</h1>${body}</main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
