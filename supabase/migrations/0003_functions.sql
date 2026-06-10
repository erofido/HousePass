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
