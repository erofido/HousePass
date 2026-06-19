-- Per-year-group curfew times, per house. Used to pre-fill (and softly cap)
-- the "back by" time when a student goes out, so younger years default to an
-- earlier return automatically.

create table if not exists public.curfews (
  id          uuid primary key default gen_random_uuid(),
  house_id    uuid not null references public.houses (id) on delete cascade,
  year_group  text not null,
  back_by     time not null,
  created_at  timestamptz not null default now(),
  unique (house_id, year_group)
);

create index if not exists curfews_house_idx on public.curfews (house_id);

alter table public.curfews enable row level security;

-- Staff may read curfews for houses they can access (leadership: all). Writes
-- go through the service-role API (/api/staff/curfews); the student-facing
-- default is read server-side, so students need no direct grant.
grant select on public.curfews to authenticated;

drop policy if exists curfews_select on public.curfews;
create policy curfews_select on public.curfews
  for select to authenticated
  using (app.can_access_house(house_id));
