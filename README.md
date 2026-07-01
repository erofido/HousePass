# Lock In 🔒

Eray's personal IB summer grind tracker. **31 → 42 points** in one summer:
Chemistry from a 3, Maths AI HL from a 4, every IA + the EE finished, all
before school starts on 7 September.

It is deliberately annoying. That's the product.

## What it does

- **Study timer + daily quota** — pick a subject, hit *LOCK IN*, bank the
  minutes. Default goal 3 h 30 m/day (the honest middle of "3–4 hours"),
  shown as a progress ring. One session at a time, forgotten timers
  self-repair, sub-minute misclicks don't count.
- **The whole Summer Action Plan, seeded** — every subject-plan task from
  the school document (Chem weeks 1–6, Maths priority topics, Econ/GloPo,
  the light-touch language tasks), all IAs, the EE draft + reflection, the
  university list (UCL/LSE/Warwick/KCL/Durham/Bocconi/IE), and the
  supercurriculars (books, MOOCs, John Locke essay, Parliament internship).
  Tick tasks → earn XP.
- **Nag notifications that escalate** — web push from 9:00 to 22:00 UK.
  Polite in the morning, savage by the evening if the board still says 0.
  Three intensities in Settings (default: *brutal*, as commissioned). Goes
  quiet while a session is running, on vacation days, and once the quota is
  met.
- **Automatic daily report to Dad** — every evening (~20:30 UK) an email
  goes to `mailfidan@gmail.com` (and Eray) with the day's minutes vs goal,
  per-subject split, tasks completed, streak, and overall plan %. No
  sugar-coating, sends even on a zero day. Test button in Settings.
- **Games as the reward** — the arcade (Snake, high scores saved) stays
  **locked until the daily quota is banked**. Study first, play after.
- **Streaks, XP, levels, achievements** — from *Bed Rotter* to *UCL Final
  Boss*; 22 achievements including *Chemistry Redemption* and *IA Assassin*.
- **Vacation mode** — mark the 2–3 holiday weeks in Settings: streak
  protected, nags silenced, grind-day countdown adjusted.
- **Installable PWA** — dark, phone-first, add to Home Screen.

## Stack

Next.js 16 (App Router) + TypeScript + Tailwind v4 · Supabase Postgres
(service-role only, nothing client-side) · Web Push (free, no third party) ·
Resend for email · Vercel hosting · GitHub Actions as the nag scheduler.

## Setup (~15 minutes)

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. SQL Editor → New query → paste all of
   [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
3. Project Settings → API: note the **URL** and the **service_role** key.

### 2. Secrets

```bash
openssl rand -hex 32   # run twice: SESSION_SECRET and CRON_SECRET
npx web-push generate-vapid-keys   # the push keypair
```

Pick a `STUDY_PASSCODE` (what you type to open the app).

### 3. Resend (the Dad email)

Create a free account at [resend.com](https://resend.com), make an API key.
The default sender `Lock In <onboarding@resend.dev>` works immediately with
no domain setup.

### 4. Vercel

Import this repo at [vercel.com](https://vercel.com/new), add every variable
from [`.env.example`](.env.example), deploy. `vercel.json` already schedules
the nightly summary; Vercel automatically authenticates it because the env
var is named `CRON_SECRET`.

### 5. The nag scheduler

Vercel's free tier only runs daily crons, so the every-25-minutes nag job
runs from GitHub Actions ([`.github/workflows/nag.yml`](.github/workflows/nag.yml)):
repo → Settings → Secrets and variables → Actions → add

| Secret | Value |
| --- | --- |
| `APP_URL` | `https://your-app.vercel.app` |
| `CRON_SECRET` | same value as on Vercel |

(Prefer Supabase? `supabase/cron.sql.example` does the same job with pg_cron.)

### 6. First login (seeds everything)

Open the app, enter the passcode — the profile, subjects and the entire
action plan are created on that first login.

### 7. Phone install + notifications

iPhone: Safari → Share → **Add to Home Screen** → open *Lock In* from the
icon → Settings → **Arm the nags** (Apple only allows web push for
installed apps). Android: just tap *Arm the nags*.

## Development

```bash
cp .env.example .env.local   # fill in
npm install
npm run dev
npm test          # streak/date logic
npm run lint && npm run typecheck
```

## How the pieces fit

```
phone/PWA ──► Next.js API routes ──► Supabase Postgres (service role only;
   ▲              (passcode cookie)     RLS on, zero client grants)
   │
web push ◄── /api/cron/nag      ◄── GitHub Actions, every 25 min 9–22h UK
email    ◄── /api/cron/summary  ◄── Vercel Cron, nightly ~20:30 UK
```

Both cron endpoints are idempotent and self-gating (quiet hours, vacation
days, once-per-day summary, spacing between nags), so over-calling them is
harmless.

## Honest limits

- Single user by design — one passcode, one profile row.
- The nag cadence rides on GitHub Actions' scheduler, which can drift a few
  minutes under load. The messages still land; the grind survives.
- The summary schedule is set in UTC; after the clocks change in October
  it lands an hour later UK time (school has started by then anyway).
- Snake high scores trust the client. If you cheat at Snake in your own
  study app, that's between you and the 42.
