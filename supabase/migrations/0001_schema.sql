-- HousePass schema. One house for the pilot, but everything is
-- house-scoped so additional houses are a data change, not a code change.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.houses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

-- Staff rows extend Supabase auth users (email/password login).
create table public.staff (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null,
  email       text not null unique,
  role        text not null check (role in ('staff', 'leadership')),
  house_id    uuid references public.houses (id),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  -- house staff must belong to a house; leadership may be house-less
  constraint staff_house_required check (role = 'leadership' or house_id is not null)
);

create table public.students (
  id                  uuid primary key default gen_random_uuid(),
  house_id            uuid not null references public.houses (id),
  full_name           text not null,
  room                text,
  year_group          text,
  -- bcrypt hash of the 4-digit PIN; never readable by client roles
  pin_hash            text not null,
  -- opaque random token encoded in the student's personal QR code
  qr_token            text not null unique default encode(gen_random_bytes(20), 'hex'),
  status              text not null default 'in' check (status in ('in', 'out')),
  active              boolean not null default true,
  failed_pin_attempts integer not null default 0,
  locked_until        timestamptz,
  created_at          timestamptz not null default now()
);

create index students_house_idx on public.students (house_id, active);

create table public.locations (
  id                   uuid primary key default gen_random_uuid(),
  -- null house_id = global destination available to every house
  house_id             uuid references public.houses (id),
  name                 text not null,
  requires_permission  boolean not null default false,
  active               boolean not null default true,
  created_at           timestamptz not null default now()
);

create unique index locations_house_name_key
  on public.locations (coalesce(house_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create table public.outings (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.students (id) on delete cascade,
  house_id         uuid not null references public.houses (id),
  location_id      uuid references public.locations (id),
  location_text    text,
  status           text not null default 'requested'
                   check (status in ('requested', 'approved', 'denied', 'cancelled', 'out', 'returned')),
  note             text,
  requested_at     timestamptz not null default now(),
  approved_by      uuid references public.staff (id),
  approved_at      timestamptz,
  expected_back_at timestamptz,
  signed_out_at    timestamptz,
  signed_in_at     timestamptz,
  signed_out_via   text,
  signed_in_via    text,
  late_alerted_at  timestamptz,
  created_at       timestamptz not null default now(),
  constraint outings_destination_present check (location_id is not null or location_text is not null)
);

create index outings_house_status_idx on public.outings (house_id, status);
create index outings_student_idx on public.outings (student_id, created_at desc);

-- A student can have at most one outing they are currently out on.
create unique index outings_one_open_per_student
  on public.outings (student_id)
  where signed_out_at is not null and signed_in_at is null;

-- The office iPad authenticates with a long-lived station token (hashed here),
-- never as an individual student.
create table public.stations (
  id           uuid primary key default gen_random_uuid(),
  house_id     uuid not null references public.houses (id),
  name         text not null,
  token_hash   text not null unique,
  active       boolean not null default true,
  last_seen_at timestamptz,
  created_at   timestamptz not null default now()
);

create table public.audit_log (
  id          bigint generated always as identity primary key,
  house_id    uuid,
  actor_type  text not null check (actor_type in ('student', 'staff', 'station', 'system')),
  actor_id    uuid,
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  at          timestamptz not null default now(),
  meta        jsonb not null default '{}'::jsonb
);

create index audit_log_house_idx on public.audit_log (house_id, at desc);

-- ---------------------------------------------------------------------------
-- Live board view: everyone currently out, with destination and due-back.
-- security_invoker so RLS of the querying staff member applies.
-- ---------------------------------------------------------------------------

create view public.live_board
  with (security_invoker = true) as
select
  o.id              as outing_id,
  o.student_id,
  s.full_name,
  s.room,
  s.year_group,
  o.house_id,
  h.name            as house_name,
  coalesce(l.name, o.location_text) as destination,
  l.requires_permission,
  o.signed_out_at,
  o.expected_back_at,
  o.late_alerted_at
from public.outings o
join public.students s on s.id = o.student_id
join public.houses h on h.id = o.house_id
left join public.locations l on l.id = o.location_id
where o.signed_out_at is not null
  and o.signed_in_at is null;

-- ---------------------------------------------------------------------------
-- Realtime: the staff dashboard subscribes to outings/students changes.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table public.outings;
alter publication supabase_realtime add table public.students;
