-- Lock In — single-user IB study tracker.
-- Paste this whole file into the Supabase SQL editor and Run once.
--
-- Trust model: the app server (service role) is the only thing that touches
-- these tables. RLS is enabled with no policies and client grants are
-- revoked, so the anon key can read/write nothing.

create table public.profile (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  user_email          text,
  parent_email        text,
  daily_goal_minutes  int  not null default 210
                      check (daily_goal_minutes between 30 and 720),
  school_start        date not null,
  birthday            date,
  timezone            text not null default 'Europe/London',
  xp                  int  not null default 0,
  nag_intensity       text not null default 'brutal'
                      check (nag_intensity in ('mild', 'firm', 'brutal')),
  -- [{ "start": "2026-07-20", "end": "2026-08-03", "label": "Family holiday" }]
  vacations           jsonb not null default '[]'::jsonb,
  best_snake          int  not null default 0,
  created_at          timestamptz not null default now()
);

create table public.subjects (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  short_name     text not null,
  level          text not null,          -- 'HL' | 'SL' | 'Core'
  current_grade  int,
  target_grade   int,
  -- 1 = daily focus (Chem, Maths), 2 = keep warm, 3 = coursework only
  priority       int  not null default 2 check (priority in (1, 2, 3)),
  color          text not null,
  sort           int  not null default 0
);

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid references public.subjects (id) on delete cascade,
  category    text not null check (category in
              ('subject', 'coursework', 'ee', 'supercurricular', 'university')),
  title       text not null,
  details     text,
  week_hint   text,
  xp          int  not null default 40,
  done        boolean not null default false,
  done_at     timestamptz,
  sort        int  not null default 0
);
create index tasks_subject_idx on public.tasks (subject_id);

create table public.sessions (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid references public.subjects (id) on delete set null,
  focus       text,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  minutes     int
);
-- One running timer at a time.
create unique index sessions_one_active_idx on public.sessions ((true))
  where ended_at is null;
create index sessions_started_idx on public.sessions (started_at);

-- Per-day cron bookkeeping (nag escalation, summary sent-once).
create table public.days (
  day                date primary key,
  nag_count          int not null default 0,
  last_nag_at        timestamptz,
  goal_met_notified  boolean not null default false,
  summary_sent_at    timestamptz
);

create table public.achievements (
  code         text primary key,
  unlocked_at  timestamptz not null default now()
);

create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

-- Service-role only: RLS on with no policies, plus belt-and-braces revokes.
alter table public.profile             enable row level security;
alter table public.subjects            enable row level security;
alter table public.tasks               enable row level security;
alter table public.sessions            enable row level security;
alter table public.days                enable row level security;
alter table public.achievements        enable row level security;
alter table public.push_subscriptions  enable row level security;

revoke all on all tables in schema public from anon, authenticated;
