-- AI Coach upgrade — run this ONLY if you already ran schema.sql before the
-- coach existed. Fresh installs get this table from schema.sql directly.

create table if not exists public.coach_notes (
  day         date primary key,
  briefing    text not null,
  created_at  timestamptz not null default now()
);

alter table public.coach_notes enable row level security;
revoke all on public.coach_notes from anon, authenticated;
