# HousePass

Digital sign-out / sign-in for boarding houses. Replaces the paper sheet
with three connected surfaces, while keeping every existing rule:

| Surface | Who | What it does |
| --- | --- | --- |
| **Office station** (`/station`) | The house iPad, paired once with a token | Scan your QR or tap your name → sign out / sign in. One scan auto-detects which. All timestamps set by the server. |
| **Staff dashboard** (`/staff`) | House staff + leadership (email/password) | Live board of who's out (overdue in red), in/out counts, one-tap approvals, printable emergency headcount, manual corrections, admin. |
| **Student app** (`/student`) | Students (name + 4-digit PIN), installable PWA | Status card, personal QR pass, request outings ahead of time. |

The rules it preserves:

- **Per-destination approval.** Self-service places (Sports Hall, Library…)
  sign out instantly; permission places (Town, off-site) need a teacher's
  approval first — configurable per destination, free-text destinations
  always need approval.
- **The office is the point of truth.** Leaving and returning are registered
  at the fixed station; students must come back to the office to sign in.
- **Server timestamps.** Set inside Postgres (`now()`), never by a client,
  not editable by students. Every transition is audit-logged.

Pilot scope is one house; everything (data, permissions, dashboards) is
house-scoped from day one, so more houses are a data change, not a rewrite.

---

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS v4
- **Supabase**: Postgres, Auth (staff), Realtime (live board), Row-Level Security
- **Vercel** for hosting; installable **PWA** with offline shell
- Email via **Resend** (optional — alerts log to console if unconfigured)

## Architecture & trust model

```
students (PIN)  ─┐                       ┌─ Supabase Auth (email/password)
station (token) ─┼─► Next.js API routes ─┼─► Postgres (service role,
                 │   HttpOnly signed     │    state-machine functions)
                 │   session cookies     │
staff ───────────┴─► supabase-js + RLS ◄─┘   ▲ realtime (RLS-filtered)
```

- **Staff** talk to Postgres directly with their Supabase session. RLS is
  the enforcement: house staff see exactly their house, leadership sees all,
  nobody can read `pin_hash` (column-level grant), and the outing state
  machine is only writable through `SECURITY DEFINER` functions
  (`api_approve_outing`, `api_mark_back_in`, …) that re-verify the caller
  and write the audit log.
- **Students and the station never get database credentials.** A 4-digit
  PIN shouldn't unlock a DB connection: they authenticate to our server
  (PIN with lockout / station token), get an HttpOnly signed cookie, and
  every action goes through API routes that call the same SQL functions via
  the service role. The `anon` role has **zero** grants.
- **Timestamps & transitions** live in `supabase/migrations/0003_functions.sql`:
  request → approve/deny → out → returned, one open outing per student
  (partial unique index), duplicate scans handled, stale status self-repair.

## Getting started

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Apply migrations (either way):
   - **CLI**: `supabase link --project-ref <ref>` then `supabase db push`
   - **SQL editor**: paste `supabase/migrations/0001…0004` in order.
3. From **Project Settings → API** note the URL, `anon` key and
   `service_role` key.

### 2. Environment

```bash
cp .env.example .env.local   # then fill in:
```

| Variable | What |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from Supabase API settings |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only; never exposed client-side |
| `SESSION_SECRET` | signs student/station cookies — `openssl rand -hex 32` |
| `CRON_SECRET` | protects `/api/cron/*` — `openssl rand -hex 32` |
| `RESEND_API_KEY`, `ALERT_FROM_EMAIL` | optional; late-alert emails |
| `RETENTION_DAYS` | history window for the retention job (default 30) |

### 3. Seed the pilot house

```bash
npm install
npm run seed
```

Creates **Heron House**, 10 students (two named *Oliver Hart* on purpose —
disambiguated by room), destinations (Town needs permission), one house
staff + one leadership login, and the station token. **Credentials (student
PINs, staff passwords, station token) are printed once** — store them
safely. Override emails/passwords with `SEED_*` env vars (see
`scripts/seed.ts`). Re-running is safe; it skips what exists.

### 4. Run / deploy

```bash
npm run dev            # local
```

**Vercel**: import the repo, add every variable from `.env.example`
(Production + Preview), deploy. No `vercel.json` needed. The camera
scanner requires HTTPS, which Vercel provides.

### 5. Schedule the background jobs

The two jobs are plain authenticated endpoints — point any scheduler at
them with the `Authorization: Bearer $CRON_SECRET` header:

- `POST /api/cron/late-alerts` — every ~5 min: emails the house's duty
  staff when someone goes past their due-back time (once per outing;
  adjusting the time re-arms it).
- `POST /api/cron/retention` — daily: deletes finished outings and audit
  entries older than `RETENTION_DAYS`. Open outings are never touched.

Easiest: Supabase Cron — copy `supabase/cron.sql.example` into the SQL
editor and replace the two placeholders. (GitHub Actions or Vercel Cron
work identically.)

### 6. Set up the house iPad (kiosk)

1. Staff → **Manage → Office station**: the seed already created one;
   rotate or add to get a pairing token.
2. On the iPad, open `https://<your-app>/station/setup`, paste the token
   (one-off; the device stays paired for a year).
3. Allow camera access when prompted; use **Add to Home Screen** for a
   clean full-screen launch.
4. Lock it down with **Guided Access** (Settings → Accessibility → Guided
   Access): triple-click the side button in Safari/the web app, which pins
   the iPad to HousePass and disables the home gesture. Set Display →
   Auto-Lock to *Never* while on duty.
5. Print pass cards from **Manage → Students → Print QR cards** for
   students without phones — the kiosk's name search works for everyone
   regardless.

If the iPad loses network it says so clearly and refuses to fake a
sign-out; the documented fallback is the paper sheet.

## Testing

```bash
npm test          # unit: session tokens, overdue/back-by time logic
npm run test:db   # spins up a scratch Postgres, applies the real
                  # migrations, runs the state-machine + RLS suites
npm run lint && npm run typecheck
```

`test:db` needs PostgreSQL ≥15 binaries (`initdb`, `pg_ctl`, `psql`) on
PATH — no Docker. It asserts the full outing lifecycle, duplicate-scan
behaviour, PIN lockout, cross-house denial, `pin_hash` unreadability, that
direct state-machine writes are refused, and that `anon` sees nothing.

## Day-to-day notes

- **Forgot to sign in**: the live board row's *Mark back in* writes a
  `staff_correction` entry to the audit log; the overdue flag clears.
- **Lost phone / card**: *Reset PIN* / *New QR* on the student row —
  old credentials stop working immediately.
- **Lost iPad**: *Rotate token* (Manage → Office station), then deactivate
  the worry: the old pairing cookie dies at next token check, and the old
  token can't pair new devices.
- **Fire drill**: Headcount → Print. OUT students are listed first with
  destination and due-back; overdue flagged.
- **New house**: insert a row in `houses`, add staff + students +
  locations + a station for it. Every view scopes automatically.

## Design decisions (made, and why)

- **Students/station are server-mediated rather than RLS-authenticated.**
  RLS still guards everything staff-facing; but PIN/token principals never
  hold a Postgres JWT at all — strictly less attack surface than minting
  custom claims for a 4-digit secret, and lockout/rate limiting has to live
  server-side anyway. Documented trade-off vs. "RLS for everyone".
- **Free-text destinations always require approval** — a student typing
  "somewhere" must pass a teacher.
- **Self-service requests auto-approve** so the kiosk shows them as
  ready-to-go; the *sign-out moment* still only happens at the office.
- **One open outing per student**, enforced by a partial unique index, not
  just application code.
- **Retention deletes** (rather than anonymises) finished history after
  `RETENTION_DAYS` — simplest defensible interpretation of data
  minimisation for a pilot; swap the DELETE for an UPDATE in
  `src/app/api/cron/retention/route.ts` if the school prefers keeping
  anonymous counts.
- **PIN lockout**: 5 wrong attempts → 5-minute lock, recorded atomically in
  SQL; same-name candidates are disambiguated by room at login.
- **Late alerts fire once per outing** and re-arm when staff adjust the
  due-back time; they are only marked sent when the email provider accepts
  them.
- Audit log has a UI-less v1 (queryable by leadership via SQL/Studio);
  the writes are what safeguarding asked for.

## Known limits (pilot honesty)

- The kiosk trusts the room it's in: anyone at the iPad could tap a name
  and sign someone out — same as the paper sheet it replaces; the QR path,
  audit trail and staff presence are the mitigations.
- Realtime falls back to a 20-second poll if the websocket drops; the
  board may briefly lag, never lie.
- Student app status is poll-based (20s) — fine for "am I signed out", not
  a push notification system.
- No photo on student records yet (disambiguation is name + room + year).

## Repository map

```
supabase/migrations/   schema, RLS, state-machine functions (the core)
supabase/tests/        SQL test suites (run via npm run test:db)
supabase/cron.sql.example  pg_cron scheduling snippet
scripts/seed.ts        pilot data, prints credentials once
scripts/db-test.sh     scratch-Postgres test harness
scripts/gen-icons.mjs  brand icon PNGs (no image deps)
src/app/station/       kiosk (QR scanner, branch flow)
src/app/staff/         dashboard (live board, approvals, headcount, manage)
src/app/student/       phone app (status, pass, requests)
src/app/api/           station/student/staff/cron route handlers
src/lib/               sessions, guards, time logic, mailer, types
```
