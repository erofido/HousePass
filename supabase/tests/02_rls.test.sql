-- RLS tests: house staff are confined to their house, leadership sees all,
-- clients cannot read PIN hashes or write the state machine directly,
-- and anon gets nothing.

\set ON_ERROR_STOP on

-- Fresh outing in each house so there is something to look at.
do $$
begin
  perform public.app_create_request(
    'd1000000-0000-0000-0000-00000000000d',          -- Sam (Heron)
    '40000000-0000-0000-0000-000000000004', null,
    now() + interval '2 hours', null, 'student', null);
  perform public.app_create_request(
    'e1000000-0000-0000-0000-00000000000e',          -- Ben (Kestrel)
    '50000000-0000-0000-0000-000000000005', null,
    now() + interval '2 hours', null, 'student', null);
end $$;

-- ---------------------------------------------------------------------------
-- 1. Alice (Heron staff) sees only Heron data
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

select assert_true(
  (select count(*) from public.houses) = 1
  and (select name from public.houses limit 1) = 'Heron House',
  'staff sees exactly their own house');

select assert_true(
  (select count(*) from public.students where house_id <> '11111111-1111-1111-1111-111111111111') = 0,
  'no students from other houses visible');

select assert_true(
  (select count(*) from public.students) = 2,
  'both Heron students visible');

select assert_true(
  (select count(*) from public.outings where house_id <> '11111111-1111-1111-1111-111111111111') = 0,
  'no outings from other houses visible');

-- Global locations are visible, other houses' are not.
select assert_true(
  exists (select 1 from public.locations where name = 'Town'),
  'global location visible');
select assert_true(
  not exists (select 1 from public.locations where name = 'Library'),
  'other house location hidden');

-- audit log scoped too
select assert_true(
  (select count(*) from public.audit_log where house_id = '22222222-2222-2222-2222-222222222222') = 0,
  'audit entries of other houses hidden');

-- PIN hash column is not readable even for own-house students.
do $$
begin
  begin
    perform (select pin_hash from public.students limit 1);
    raise exception 'ASSERT FAILED: pin_hash should not be selectable';
  exception when insufficient_privilege then
    null; -- expected
  end;
end $$;

-- Direct writes to the state machine are refused.
do $$
begin
  begin
    insert into public.outings (student_id, house_id, location_id, expected_back_at)
    values ('d1000000-0000-0000-0000-00000000000d',
            '11111111-1111-1111-1111-111111111111',
            '30000000-0000-0000-0000-000000000003',
            now() + interval '1 hour');
    raise exception 'ASSERT FAILED: direct outing insert should be refused';
  exception when insufficient_privilege then
    null;
  end;
end $$;

do $$
begin
  begin
    update public.students set status = 'out'
    where id = 'd1000000-0000-0000-0000-00000000000d';
    raise exception 'ASSERT FAILED: direct status update should be refused';
  exception when insufficient_privilege then
    null;
  end;
end $$;

-- Server-only functions are not callable by staff sessions.
do $$
begin
  begin
    perform public.app_station_sign_in(
      '11111111-1111-1111-1111-111111111111',
      'd1000000-0000-0000-0000-00000000000d', 'kiosk_qr', null);
    raise exception 'ASSERT FAILED: app_* functions should be service-role only';
  exception when insufficient_privilege then
    null;
  end;
end $$;

-- Editing non-sensitive student fields in their own house is allowed...
update public.students set room = '14' where id = 'd1000000-0000-0000-0000-00000000000d';
select assert_true(
  (select room from public.students where id = 'd1000000-0000-0000-0000-00000000000d') = '14',
  'staff can edit own-house student room');

rollback;

-- ---------------------------------------------------------------------------
-- 2. ...but cross-house edits silently match zero rows
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  n integer;
begin
  update public.students set room = 'HACKED'
  where id = 'd1000000-0000-0000-0000-00000000000d';   -- Heron student, Bob is Kestrel
  get diagnostics n = row_count;
  perform assert_true(n = 0, 'cross-house student update touches zero rows');
end $$;

select assert_true(
  (select count(*) from public.students) = 1,
  'Bob sees only the Kestrel student');

select assert_true(
  not exists (select 1 from public.live_board where house_id <> '22222222-2222-2222-2222-222222222222'),
  'live board respects house scope');

rollback;

-- ---------------------------------------------------------------------------
-- 3. Zara (leadership) sees everything
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
set local role authenticated;

select assert_true((select count(*) from public.houses) = 2, 'leadership sees all houses');
select assert_true((select count(*) from public.students) = 3, 'leadership sees all students');
select assert_true(
  exists (select 1 from public.outings where house_id = '22222222-2222-2222-2222-222222222222'),
  'leadership sees other-house outings');

rollback;

-- ---------------------------------------------------------------------------
-- 4. A non-staff authenticated user (e.g. deleted staff) sees nothing
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}', true);
set local role authenticated;

select assert_true((select count(*) from public.houses) = 0, 'unknown user sees no houses');
select assert_true((select count(*) from public.students) = 0, 'unknown user sees no students');
select assert_true((select count(*) from public.outings) = 0, 'unknown user sees no outings');

rollback;

-- ---------------------------------------------------------------------------
-- 5. anon role: no access at all
-- ---------------------------------------------------------------------------
begin;
set local role anon;

do $$
begin
  begin
    perform (select count(*) from public.students);
    raise exception 'ASSERT FAILED: anon should not read students';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform (select count(*) from public.outings);
    raise exception 'ASSERT FAILED: anon should not read outings';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform (select count(*) from public.stations);
    raise exception 'ASSERT FAILED: anon should not read stations';
  exception when insufficient_privilege then
    null;
  end;
end $$;

rollback;

-- ---------------------------------------------------------------------------
-- 6. Stations are invisible even to leadership (server-only table)
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  begin
    perform (select count(*) from public.stations);
    raise exception 'ASSERT FAILED: stations should be unreadable';
  exception when insufficient_privilege then
    null;
  end;
end $$;

rollback;

select 'rls tests passed' as result;
