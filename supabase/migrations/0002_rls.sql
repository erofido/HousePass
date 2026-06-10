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
