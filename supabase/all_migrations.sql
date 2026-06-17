-- HousePass: all migrations in one file (for the Supabase SQL editor).
-- Generated from supabase/migrations/ — do not edit by hand; run
-- `npm run migrations:bundle` after changing a migration.
-- Safe to run once on a fresh project.

-- ============================== 0001_schema.sql ==============================
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

-- ============================== 0002_rls.sql ==============================
-- Row-Level Security.
--
-- Trust model:
--   * Staff sign in with Supabase Auth and talk to the database directly;
--     these policies are what scopes them to their house.
--   * Students and the office station never receive database credentials.
--     They authenticate to the Next.js server (PIN / station token), which
--     acts via the service role. RLS therefore denies anon entirely.
--   * State-machine writes (sign out / sign in / approve) happen only via
--     the functions in 0003, never via direct table writes.

create schema if not exists app;

-- Helper predicates. SECURITY DEFINER so they can read public.staff without
-- tripping the staff table's own RLS recursively.

create or replace function app.current_staff_role()
returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select role from public.staff where id = auth.uid() and active
$$;

create or replace function app.is_staff()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.staff where id = auth.uid() and active)
$$;

create or replace function app.is_leadership()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.staff
    where id = auth.uid() and active and role = 'leadership'
  )
$$;

create or replace function app.staff_house()
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select house_id from public.staff where id = auth.uid() and active
$$;

-- Leadership can touch every house; house staff only their own.
create or replace function app.can_access_house(h uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select app.is_leadership() or (h is not null and h = app.staff_house())
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere (deny by default).
-- ---------------------------------------------------------------------------

alter table public.houses     enable row level security;
alter table public.staff      enable row level security;
alter table public.students   enable row level security;
alter table public.locations  enable row level security;
alter table public.outings    enable row level security;
alter table public.stations   enable row level security;
alter table public.audit_log  enable row level security;

-- ---------------------------------------------------------------------------
-- Table privileges. Start from zero, then grant exactly what staff use.
-- anon gets nothing at all. service_role keeps its implicit bypass.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

grant usage on schema app to authenticated;

grant select on public.houses     to authenticated;
grant select on public.staff      to authenticated;
grant select on public.locations  to authenticated;
grant select on public.outings    to authenticated;
grant select on public.audit_log  to authenticated;
grant select on public.live_board to authenticated;

-- students: every column except pin_hash (column-list grant, so the PIN hash
-- is unreadable even to leadership through the API).
grant select (id, house_id, full_name, room, year_group, qr_token, status,
              active, failed_pin_attempts, locked_until, created_at)
  on public.students to authenticated;

-- Staff may edit non-sensitive student fields directly; PINs, QR tokens and
-- status are only ever touched by server routes / state-machine functions.
grant update (full_name, room, year_group, active)
  on public.students to authenticated;

-- Locations are simple reference data staff manage from the dashboard.
grant insert, update on public.locations to authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

-- houses: staff see their own house, leadership sees all.
create policy houses_select on public.houses
  for select to authenticated
  using (app.can_access_house(id));

-- staff: see yourself, colleagues in your house, and everyone if leadership.
create policy staff_select on public.staff
  for select to authenticated
  using (id = auth.uid() or app.can_access_house(house_id) or app.is_leadership());

-- students: house-scoped read and (column-limited) update.
create policy students_select on public.students
  for select to authenticated
  using (app.can_access_house(house_id));

create policy students_update on public.students
  for update to authenticated
  using (app.can_access_house(house_id))
  with check (app.can_access_house(house_id));

-- locations: global ones are visible to all staff; house ones to that house.
create policy locations_select on public.locations
  for select to authenticated
  using (house_id is null or app.can_access_house(house_id));

create policy locations_insert on public.locations
  for insert to authenticated
  with check (
    app.is_leadership()
    or (house_id is not null and app.can_access_house(house_id))
  );

create policy locations_update on public.locations
  for update to authenticated
  using (
    app.is_leadership()
    or (house_id is not null and app.can_access_house(house_id))
  )
  with check (
    app.is_leadership()
    or (house_id is not null and app.can_access_house(house_id))
  );

-- outings: house-scoped read; all writes go through 0003's functions.
create policy outings_select on public.outings
  for select to authenticated
  using (app.can_access_house(house_id));

-- audit log: house-scoped read (leadership reads all).
create policy audit_select on public.audit_log
  for select to authenticated
  using (app.can_access_house(house_id));

-- stations: RLS enabled with no policies — service role only.

-- ---------------------------------------------------------------------------
-- Helper function privileges: policy predicates are evaluated with the
-- querying role's privileges, so authenticated needs execute — nobody else.
-- ---------------------------------------------------------------------------

revoke all on function app.current_staff_role() from public, anon;
revoke all on function app.is_staff()           from public, anon;
revoke all on function app.is_leadership()      from public, anon;
revoke all on function app.staff_house()        from public, anon;
revoke all on function app.can_access_house(uuid) from public, anon;

grant execute on function app.current_staff_role()   to authenticated;
grant execute on function app.is_staff()             to authenticated;
grant execute on function app.is_leadership()        to authenticated;
grant execute on function app.staff_house()          to authenticated;
grant execute on function app.can_access_house(uuid) to authenticated;

-- ============================== 0003_functions.sql ==============================
-- The outing state machine.
--
--   requested --approve--> approved --sign out--> out --sign in--> returned
--       |   \--deny--> denied
--       \--cancel--> cancelled        (self-service skips straight to approved/out)
--
-- Two families of functions:
--   api_*  — called by signed-in STAFF via supabase.rpc(); they verify the
--            caller's house themselves (defence in depth on top of RLS).
--   app_*  — called only by the trusted server (service role) on behalf of
--            students and the office station, which never get DB credentials.
--
-- Every timestamp is set with now() inside the database: clients can neither
-- supply nor edit them. Every transition writes to audit_log.
--
-- Errors are raised with a stable machine-readable message code (e.g.
-- 'already_out') that the UI maps to a friendly explanation.

-- ---------------------------------------------------------------------------
-- Internals
-- ---------------------------------------------------------------------------

create or replace function app.audit(
  p_house uuid, p_actor_type text, p_actor uuid,
  p_action text, p_entity text, p_entity_id uuid,
  p_meta jsonb default '{}'::jsonb
) returns void
language sql security definer
set search_path = public, pg_temp
as $$
  insert into public.audit_log (house_id, actor_type, actor_id, action, entity, entity_id, meta)
  values (p_house, p_actor_type, p_actor, p_action, p_entity, p_entity_id, coalesce(p_meta, '{}'::jsonb));
$$;

-- Caller identity for api_* functions: the active staff row for auth.uid(),
-- or an exception if the JWT does not belong to active staff.
create or replace function app.require_staff()
returns public.staff
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  s public.staff;
begin
  select * into s from public.staff where id = auth.uid() and active;
  if not found then
    raise exception 'not_staff' using errcode = 'P0001';
  end if;
  return s;
end;
$$;

-- Shared sign-in: completes the student's open outing.
-- Returns NULL (rather than raising) when there is nothing open, so that the
-- stale-status repair below can still commit; callers translate NULL into a
-- friendly "already signed in" message.
create or replace function app.complete_sign_in(
  p_student_id uuid, p_via text, p_actor_type text, p_actor_id uuid
) returns public.outings
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  st public.students;
  o  public.outings;
begin
  select * into st from public.students where id = p_student_id for update;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0001';
  end if;

  select * into o
  from public.outings
  where student_id = p_student_id
    and signed_out_at is not null
    and signed_in_at is null
  for update;

  if not found then
    -- Nothing open: repair a stale status flag rather than failing silently.
    if st.status = 'out' then
      update public.students set status = 'in' where id = st.id;
      perform app.audit(st.house_id, 'system', null, 'student.status_repaired', 'student', st.id,
                        jsonb_build_object('from', 'out', 'to', 'in'));
    end if;
    return null;
  end if;

  update public.outings
  set status = 'returned', signed_in_at = now(), signed_in_via = p_via
  where id = o.id
  returning * into o;

  update public.students set status = 'in' where id = st.id;

  perform app.audit(o.house_id, p_actor_type, p_actor_id, 'outing.signed_in', 'outing', o.id,
                    jsonb_build_object('student_id', st.id, 'via', p_via));
  return o;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff-facing RPCs (supabase.rpc from the dashboard)
-- ---------------------------------------------------------------------------

create or replace function public.api_approve_outing(
  p_outing_id uuid,
  p_expected_back_at timestamptz default null
) returns public.outings
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  caller public.staff;
  o public.outings;
begin
  caller := app.require_staff();

  select * into o from public.outings where id = p_outing_id for update;
  if not found or not app.can_access_house(o.house_id) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if o.status <> 'requested' then
    raise exception 'not_requested' using errcode = 'P0001';
  end if;
  if coalesce(p_expected_back_at, o.expected_back_at) is null then
    raise exception 'expected_back_required' using errcode = 'P0001';
  end if;

  update public.outings
  set status = 'approved',
      approved_by = caller.id,
      approved_at = now(),
      expected_back_at = coalesce(p_expected_back_at, expected_back_at)
  where id = o.id
  returning * into o;

  perform app.audit(o.house_id, 'staff', caller.id, 'outing.approved', 'outing', o.id,
                    jsonb_build_object('student_id', o.student_id,
                                       'expected_back_at', o.expected_back_at));
  return o;
end;
$$;

create or replace function public.api_deny_outing(p_outing_id uuid)
returns public.outings
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  caller public.staff;
  o public.outings;
begin
  caller := app.require_staff();

  select * into o from public.outings where id = p_outing_id for update;
  if not found or not app.can_access_house(o.house_id) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if o.status <> 'requested' then
    raise exception 'not_requested' using errcode = 'P0001';
  end if;

  update public.outings set status = 'denied' where id = o.id returning * into o;

  perform app.audit(o.house_id, 'staff', caller.id, 'outing.denied', 'outing', o.id,
                    jsonb_build_object('student_id', o.student_id));
  return o;
end;
$$;

-- Adjust the due-back time of a pending/approved/out outing.
create or replace function public.api_update_expected_back(
  p_outing_id uuid,
  p_expected_back_at timestamptz
) returns public.outings
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  caller public.staff;
  o public.outings;
begin
  caller := app.require_staff();

  if p_expected_back_at is null then
    raise exception 'expected_back_required' using errcode = 'P0001';
  end if;

  select * into o from public.outings where id = p_outing_id for update;
  if not found or not app.can_access_house(o.house_id) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if o.status not in ('requested', 'approved', 'out') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  update public.outings
  set expected_back_at = p_expected_back_at,
      -- a new due-back time re-arms the late alert
      late_alerted_at = null
  where id = o.id
  returning * into o;

  perform app.audit(o.house_id, 'staff', caller.id, 'outing.expected_back_changed', 'outing', o.id,
                    jsonb_build_object('student_id', o.student_id,
                                       'expected_back_at', p_expected_back_at));
  return o;
end;
$$;

-- Manual correction: "they're back, they just forgot to sign in."
-- Returns NULL if the student had no open outing (any stale flag is repaired).
create or replace function public.api_mark_back_in(p_student_id uuid)
returns public.outings
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  caller public.staff;
  st public.students;
begin
  caller := app.require_staff();

  select * into st from public.students where id = p_student_id;
  if not found or not app.can_access_house(st.house_id) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  return app.complete_sign_in(p_student_id, 'staff_correction', 'staff', caller.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Server-only functions (service role; revoked from client roles below)
-- ---------------------------------------------------------------------------

-- Create an outing request (student phone app, or the kiosk for a
-- permission destination). Self-service destinations auto-approve.
create or replace function public.app_create_request(
  p_student_id uuid,
  p_location_id uuid,
  p_location_text text,
  p_expected_back_at timestamptz,
  p_note text,
  p_actor_type text,
  p_actor_id uuid
) returns public.outings
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  st public.students;
  loc public.locations;
  needs_permission boolean;
  o public.outings;
begin
  select * into st from public.students where id = p_student_id and active;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0001';
  end if;
  if p_expected_back_at is null then
    raise exception 'expected_back_required' using errcode = 'P0001';
  end if;

  if p_location_id is not null then
    select * into loc from public.locations
    where id = p_location_id and active
      and (house_id is null or house_id = st.house_id);
    if not found then
      raise exception 'location_not_found' using errcode = 'P0001';
    end if;
    needs_permission := loc.requires_permission;
  elsif nullif(trim(p_location_text), '') is not null then
    -- free-text destinations always need a teacher's permission
    needs_permission := true;
  else
    raise exception 'destination_required' using errcode = 'P0001';
  end if;

  insert into public.outings
    (student_id, house_id, location_id, location_text, status, note, expected_back_at)
  values
    (st.id, st.house_id, loc.id, nullif(trim(p_location_text), ''),
     case when needs_permission then 'requested' else 'approved' end,
     nullif(trim(p_note), ''), p_expected_back_at)
  returning * into o;

  perform app.audit(o.house_id, p_actor_type, p_actor_id,
                    case when needs_permission then 'outing.requested' else 'outing.auto_approved' end,
                    'outing', o.id,
                    jsonb_build_object('student_id', st.id,
                                       'destination', coalesce(loc.name, o.location_text)));
  return o;
end;
$$;

-- Station: student confirms departure on an approved outing.
create or replace function public.app_station_sign_out(
  p_house_id uuid,
  p_outing_id uuid,
  p_via text,
  p_station_id uuid
) returns public.outings
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  o public.outings;
  st public.students;
begin
  select * into o from public.outings
  where id = p_outing_id and house_id = p_house_id
  for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if o.status = 'requested' then
    raise exception 'not_approved' using errcode = 'P0001';
  end if;
  if o.status <> 'approved' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select * into st from public.students where id = o.student_id for update;
  if not st.active then
    raise exception 'student_not_found' using errcode = 'P0001';
  end if;
  if st.status = 'out' then
    raise exception 'already_out' using errcode = 'P0001';
  end if;

  update public.outings
  set status = 'out', signed_out_at = now(), signed_out_via = p_via
  where id = o.id
  returning * into o;

  update public.students set status = 'out' where id = st.id;

  perform app.audit(o.house_id, 'station', p_station_id, 'outing.signed_out', 'outing', o.id,
                    jsonb_build_object('student_id', st.id, 'via', p_via));
  return o;
end;
$$;

-- Station: student picks a destination at the iPad with no prior request.
-- Self-service places sign out immediately; permission places create a
-- 'requested' outing the dashboard can approve (status tells the kiosk which).
create or replace function public.app_station_start(
  p_house_id uuid,
  p_student_id uuid,
  p_location_id uuid,
  p_expected_back_at timestamptz,
  p_via text,
  p_station_id uuid
) returns public.outings
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  st public.students;
  loc public.locations;
  o public.outings;
begin
  select * into st from public.students
  where id = p_student_id and house_id = p_house_id and active
  for update;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0001';
  end if;
  if st.status = 'out' then
    raise exception 'already_out' using errcode = 'P0001';
  end if;
  if p_expected_back_at is null then
    raise exception 'expected_back_required' using errcode = 'P0001';
  end if;

  select * into loc from public.locations
  where id = p_location_id and active
    and (house_id is null or house_id = st.house_id);
  if not found then
    raise exception 'location_not_found' using errcode = 'P0001';
  end if;

  if loc.requires_permission then
    insert into public.outings
      (student_id, house_id, location_id, status, expected_back_at)
    values (st.id, st.house_id, loc.id, 'requested', p_expected_back_at)
    returning * into o;

    perform app.audit(o.house_id, 'station', p_station_id, 'outing.requested', 'outing', o.id,
                      jsonb_build_object('student_id', st.id, 'destination', loc.name, 'via', p_via));
    return o;
  end if;

  insert into public.outings
    (student_id, house_id, location_id, status, expected_back_at,
     signed_out_at, signed_out_via)
  values (st.id, st.house_id, loc.id, 'out', p_expected_back_at, now(), p_via)
  returning * into o;

  update public.students set status = 'out' where id = st.id;

  perform app.audit(o.house_id, 'station', p_station_id, 'outing.signed_out', 'outing', o.id,
                    jsonb_build_object('student_id', st.id, 'destination', loc.name,
                                       'via', p_via, 'self_service', true));
  return o;
end;
$$;

-- Station: welcome back.
create or replace function public.app_station_sign_in(
  p_house_id uuid,
  p_student_id uuid,
  p_via text,
  p_station_id uuid
) returns public.outings
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  st public.students;
begin
  select * into st from public.students
  where id = p_student_id and house_id = p_house_id;
  if not found then
    raise exception 'student_not_found' using errcode = 'P0001';
  end if;
  return app.complete_sign_in(p_student_id, p_via, 'station', p_station_id);
end;
$$;

-- Student cancels their own pending or approved (not yet departed) request.
create or replace function public.app_student_cancel(
  p_student_id uuid,
  p_outing_id uuid
) returns public.outings
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  o public.outings;
begin
  select * into o from public.outings
  where id = p_outing_id and student_id = p_student_id
  for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if o.status not in ('requested', 'approved') or o.signed_out_at is not null then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  update public.outings set status = 'cancelled' where id = o.id returning * into o;

  perform app.audit(o.house_id, 'student', p_student_id, 'outing.cancelled', 'outing', o.id, '{}'::jsonb);
  return o;
end;
$$;

-- ---------------------------------------------------------------------------
-- Execute privileges: staff RPCs for authenticated; app_* for service role only.
-- ---------------------------------------------------------------------------

revoke all on function public.api_approve_outing(uuid, timestamptz)                     from public, anon, authenticated;
revoke all on function public.api_deny_outing(uuid)                                     from public, anon, authenticated;
revoke all on function public.api_update_expected_back(uuid, timestamptz)               from public, anon, authenticated;
revoke all on function public.api_mark_back_in(uuid)                                    from public, anon, authenticated;
revoke all on function public.app_create_request(uuid, uuid, text, timestamptz, text, text, uuid) from public, anon, authenticated;
revoke all on function public.app_station_sign_out(uuid, uuid, text, uuid)              from public, anon, authenticated;
revoke all on function public.app_station_start(uuid, uuid, uuid, timestamptz, text, uuid) from public, anon, authenticated;
revoke all on function public.app_station_sign_in(uuid, uuid, text, uuid)               from public, anon, authenticated;
revoke all on function public.app_student_cancel(uuid, uuid)                            from public, anon, authenticated;

grant execute on function public.api_approve_outing(uuid, timestamptz)       to authenticated;
grant execute on function public.api_deny_outing(uuid)                       to authenticated;
grant execute on function public.api_update_expected_back(uuid, timestamptz) to authenticated;
grant execute on function public.api_mark_back_in(uuid)                      to authenticated;

-- Internal helpers must not be callable by client roles either.
revoke all on function app.audit(uuid, text, uuid, text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function app.require_staff()                                  from public, anon, authenticated;
revoke all on function app.complete_sign_in(uuid, text, text, uuid)         from public, anon, authenticated;

-- ============================== 0004_auth_support.sql ==============================
-- PIN rate limiting: atomic recording of login attempts, with lockout.
-- Called only by the server (service role) from the student login route.

create or replace function public.app_pin_attempt(
  p_candidate_ids uuid[],
  p_success_id uuid  -- null = all candidates failed
) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  locked_count integer;
begin
  if p_success_id is not null then
    update public.students
    set failed_pin_attempts = 0, locked_until = null
    where id = p_success_id;

    perform app.audit(
      (select house_id from public.students where id = p_success_id),
      'student', p_success_id, 'student.login', 'student', p_success_id);
    return;
  end if;

  -- Failed attempt: bump every candidate that matched the typed name, and
  -- lock for 5 minutes after the 5th consecutive failure (counter resets
  -- when the lock is applied). Both CASEs read the pre-update value.
  update public.students
  set locked_until = case
        when failed_pin_attempts + 1 >= 5 then now() + interval '5 minutes'
        else locked_until
      end,
      failed_pin_attempts = case
        when failed_pin_attempts + 1 >= 5 then 0
        else failed_pin_attempts + 1
      end
    where id = any (p_candidate_ids);

  get diagnostics locked_count = row_count;
  if locked_count > 0 then
    perform app.audit(
      (select house_id from public.students where id = p_candidate_ids[1]),
      'system', null, 'student.login_failed', 'student', p_candidate_ids[1],
      jsonb_build_object('candidates', coalesce(array_length(p_candidate_ids, 1), 0)));
  end if;
end;
$$;

revoke all on function public.app_pin_attempt(uuid[], uuid) from public, anon, authenticated;

-- ============================== 0005_push.sql ==============================
-- Web Push: device subscriptions + per-outing notification bookkeeping.

-- One row per browser/device push subscription. Written only by the server
-- (service role) from /api/push/*. RLS on, no policies -> clients can't read
-- each other's subscriptions.
create table public.push_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  subscriber_type  text not null check (subscriber_type in ('student', 'staff')),
  subscriber_id    uuid not null,
  house_id         uuid references public.houses (id),
  endpoint         text not null unique,
  p256dh           text not null,
  auth             text not null,
  user_agent       text,
  created_at       timestamptz not null default now(),
  last_used_at     timestamptz
);

create index push_subscriptions_subscriber_idx
  on public.push_subscriptions (subscriber_type, subscriber_id);
create index push_subscriptions_house_idx
  on public.push_subscriptions (house_id);

alter table public.push_subscriptions enable row level security;
-- service-role only: no grants to anon/authenticated, no policies.

-- Notification bookkeeping on outings, independent of the email channel
-- (which uses late_alerted_at). Each fires at most once per outing; changing
-- the due-back time re-arms both.
alter table public.outings
  add column remind_sent_at        timestamptz,
  add column overdue_push_sent_at  timestamptz;

-- Re-arm every notification channel when staff change the due-back time.
create or replace function public.api_update_expected_back(
  p_outing_id uuid,
  p_expected_back_at timestamptz
) returns public.outings
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  caller public.staff;
  o public.outings;
begin
  caller := app.require_staff();

  if p_expected_back_at is null then
    raise exception 'expected_back_required' using errcode = 'P0001';
  end if;

  select * into o from public.outings where id = p_outing_id for update;
  if not found or not app.can_access_house(o.house_id) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if o.status not in ('requested', 'approved', 'out') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  update public.outings
  set expected_back_at = p_expected_back_at,
      late_alerted_at = null,
      remind_sent_at = null,
      overdue_push_sent_at = null
  where id = o.id
  returning * into o;

  perform app.audit(o.house_id, 'staff', caller.id, 'outing.expected_back_changed', 'outing', o.id,
                    jsonb_build_object('student_id', o.student_id,
                                       'expected_back_at', p_expected_back_at));
  return o;
end;
$$;

-- ============================== 0006_rotating_qr.sql ==============================
-- Rotating QR codes (TOTP-style, anti-screenshot).
--
-- Each student gets a per-student secret. The phone app derives a short code
-- from it that changes every few seconds; the kiosk verifies it against the
-- SERVER clock. qr_token stays as the (non-secret) lookup id in the payload.
--
-- qr_secret is sensitive (like pin_hash): it is NOT in the column-level grant
-- to authenticated, so staff/anon can never read it — only the service role
-- (the student's own /api/student/me) hands it to the signed-in student.

alter table public.students
  add column qr_secret    text   not null default encode(gen_random_bytes(20), 'hex'),
  -- highest time-step already accepted for this student; blocks replay of a
  -- captured code within its validity window.
  add column last_qr_step bigint not null default 0;

-- ============================== 0007_station_code.sql ==============================
-- Rotating station code (shown on the office iPad, scanned by phones).
--
-- The iPad displays a QR that rotates like the student pass. A phone scans it
-- to sign out / in; the server checks the code against ITS clock, proving the
-- phone was physically at that office screen within the last few seconds.
-- Service-role only (stations table has no client grants), like the pairing
-- token.
alter table public.stations
  add column code_secret text not null default encode(gen_random_bytes(20), 'hex');
