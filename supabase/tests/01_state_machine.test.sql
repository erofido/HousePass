-- State machine tests. Run as the superuser harness; service-role behaviour
-- is exercised by calling the app_* functions directly (the trusted server
-- path), staff RPCs by switching to the authenticated role with a staff JWT.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- 1. Phone request to a permission destination -> 'requested'
-- ---------------------------------------------------------------------------
do $$
declare
  o public.outings;
begin
  o := public.app_create_request(
    'd1000000-0000-0000-0000-00000000000d',          -- Sam
    '40000000-0000-0000-0000-000000000004',          -- Town (permission)
    null, now() + interval '2 hours', 'Buying a present', 'student',
    'd1000000-0000-0000-0000-00000000000d');
  perform assert_true(o.status = 'requested', 'town request should be requested');
  perform assert_true(o.signed_out_at is null, 'no sign-out timestamp yet');
end $$;

-- ---------------------------------------------------------------------------
-- 2. Phone request to a self-service destination -> auto 'approved'
-- ---------------------------------------------------------------------------
do $$
declare
  o public.outings;
begin
  o := public.app_create_request(
    'd2000000-0000-0000-0000-00000000000d',          -- Mia
    '30000000-0000-0000-0000-000000000003',          -- Sports Hall
    null, now() + interval '1 hour', null, 'student',
    'd2000000-0000-0000-0000-00000000000d');
  perform assert_true(o.status = 'approved', 'self-service request auto-approves');
end $$;

-- ---------------------------------------------------------------------------
-- 3. Free-text destination always needs permission
-- ---------------------------------------------------------------------------
do $$
declare
  o public.outings;
begin
  o := public.app_create_request(
    'd2000000-0000-0000-0000-00000000000d', null,
    'Dentist appointment', now() + interval '3 hours', null, 'student',
    'd2000000-0000-0000-0000-00000000000d');
  perform assert_true(o.status = 'requested', 'free-text destination requires permission');
end $$;

-- ---------------------------------------------------------------------------
-- 4. Missing expected-back time is rejected
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    perform public.app_create_request(
      'd1000000-0000-0000-0000-00000000000d',
      '30000000-0000-0000-0000-000000000003',
      null, null, null, 'student', null);
    raise exception 'ASSERT FAILED: expected expected_back_required';
  exception when others then
    if sqlerrm <> 'expected_back_required' then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Location belonging to another house is rejected
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    perform public.app_create_request(
      'd1000000-0000-0000-0000-00000000000d',          -- Sam (Heron)
      '50000000-0000-0000-0000-000000000005',          -- Library (Kestrel)
      null, now() + interval '1 hour', null, 'student', null);
    raise exception 'ASSERT FAILED: expected location_not_found';
  exception when others then
    if sqlerrm <> 'location_not_found' then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Staff approval of Sam's town request (as Alice via JWT claims)
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  req_id uuid;
  o public.outings;
begin
  select id into req_id from public.outings
  where student_id = 'd1000000-0000-0000-0000-00000000000d' and status = 'requested';

  o := public.api_approve_outing(req_id, now() + interval '2 hours');
  perform assert_true(o.status = 'approved', 'approval moves request to approved');
  perform assert_true(o.approved_by = 'a1000000-0000-0000-0000-00000000000a', 'approved_by recorded');
  perform assert_true(o.approved_at is not null, 'approved_at set by server');
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 7. Cross-house approval is refused (Bob of Kestrel cannot touch Heron)
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  mia_req uuid;
begin
  -- Mia's free-text request (Heron house) is still 'requested'
  select id into mia_req from public.outings
  where student_id = 'd2000000-0000-0000-0000-00000000000d' and status = 'requested';

  begin
    perform public.api_approve_outing(mia_req, now() + interval '1 hour');
    raise exception 'ASSERT FAILED: cross-house approval should fail';
  exception when others then
    if sqlerrm <> 'not_found' then raise; end if;
  end;
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- 8. Station sign-out of the approved outing; timestamps are server-side
-- ---------------------------------------------------------------------------
do $$
declare
  appr_id uuid;
  o public.outings;
  st public.students;
begin
  select id into appr_id from public.outings
  where student_id = 'd1000000-0000-0000-0000-00000000000d' and status = 'approved';

  o := public.app_station_sign_out(
    '11111111-1111-1111-1111-111111111111', appr_id, 'kiosk_qr',
    '60000000-0000-0000-0000-000000000006');

  perform assert_true(o.status = 'out', 'sign-out moves to out');
  perform assert_true(o.signed_out_at is not null, 'signed_out_at set');
  perform assert_true(o.signed_out_via = 'kiosk_qr', 'via recorded');

  select * into st from public.students where id = o.student_id;
  perform assert_true(st.status = 'out', 'student flag flips to out');
end $$;

-- ---------------------------------------------------------------------------
-- 9. While out: a second departure attempt is refused
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    perform public.app_station_start(
      '11111111-1111-1111-1111-111111111111',
      'd1000000-0000-0000-0000-00000000000d',
      '30000000-0000-0000-0000-000000000003',
      now() + interval '1 hour', 'kiosk_tap',
      '60000000-0000-0000-0000-000000000006');
    raise exception 'ASSERT FAILED: expected already_out';
  exception when others then
    if sqlerrm <> 'already_out' then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Station sign-in completes the loop
-- ---------------------------------------------------------------------------
do $$
declare
  o public.outings;
  st public.students;
begin
  o := public.app_station_sign_in(
    '11111111-1111-1111-1111-111111111111',
    'd1000000-0000-0000-0000-00000000000d',
    'kiosk_qr', '60000000-0000-0000-0000-000000000006');

  perform assert_true(o.status = 'returned', 'sign-in moves to returned');
  perform assert_true(o.signed_in_at is not null, 'signed_in_at set');

  select * into st from public.students where id = 'd1000000-0000-0000-0000-00000000000d';
  perform assert_true(st.status = 'in', 'student flag back to in');
end $$;

-- ---------------------------------------------------------------------------
-- 11. Duplicate sign-in returns NULL (friendly no-op), not a crash
-- ---------------------------------------------------------------------------
do $$
declare
  o public.outings;
begin
  o := public.app_station_sign_in(
    '11111111-1111-1111-1111-111111111111',
    'd1000000-0000-0000-0000-00000000000d',
    'kiosk_qr', '60000000-0000-0000-0000-000000000006');
  perform assert_true(o.id is null, 'second sign-in finds nothing open');
end $$;

-- ---------------------------------------------------------------------------
-- 12. Kiosk self-service walk-up: straight to out, then back in
-- ---------------------------------------------------------------------------
do $$
declare
  o public.outings;
begin
  o := public.app_station_start(
    '11111111-1111-1111-1111-111111111111',
    'd1000000-0000-0000-0000-00000000000d',
    '30000000-0000-0000-0000-000000000003',          -- Sports Hall, self-service
    now() + interval '1 hour', 'kiosk_tap',
    '60000000-0000-0000-0000-000000000006');
  perform assert_true(o.status = 'out', 'self-service walk-up signs straight out');
  perform assert_true(o.signed_out_at is not null, 'departure stamped');

  o := public.app_station_sign_in(
    '11111111-1111-1111-1111-111111111111',
    'd1000000-0000-0000-0000-00000000000d',
    'kiosk_tap', '60000000-0000-0000-0000-000000000006');
  perform assert_true(o.status = 'returned', 'walk-up returns cleanly');
end $$;

-- ---------------------------------------------------------------------------
-- 13. Kiosk walk-up to a permission destination parks as 'requested'
-- ---------------------------------------------------------------------------
do $$
declare
  o public.outings;
begin
  o := public.app_station_start(
    '11111111-1111-1111-1111-111111111111',
    'd1000000-0000-0000-0000-00000000000d',
    '40000000-0000-0000-0000-000000000004',          -- Town
    now() + interval '2 hours', 'kiosk_tap',
    '60000000-0000-0000-0000-000000000006');
  perform assert_true(o.status = 'requested', 'permission walk-up waits for approval');
  perform assert_true(o.signed_out_at is null, 'not signed out until approved + confirmed');
end $$;

-- ---------------------------------------------------------------------------
-- 14. Staff deny (as Alice)
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  req uuid;
  o public.outings;
begin
  select id into req from public.outings
  where student_id = 'd1000000-0000-0000-0000-00000000000d' and status = 'requested'
  order by created_at desc limit 1;

  o := public.api_deny_outing(req);
  perform assert_true(o.status = 'denied', 'deny works');
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 15. Manual correction: sign Mia out, then staff mark her back in
-- ---------------------------------------------------------------------------
do $$
declare
  appr uuid;
begin
  select id into appr from public.outings
  where student_id = 'd2000000-0000-0000-0000-00000000000d' and status = 'approved';
  perform public.app_station_sign_out(
    '11111111-1111-1111-1111-111111111111', appr, 'kiosk_tap',
    '60000000-0000-0000-0000-000000000006');
end $$;

begin;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  o public.outings;
  st_status text;
begin
  o := public.api_mark_back_in('d2000000-0000-0000-0000-00000000000d');
  perform assert_true(o.status = 'returned', 'manual correction completes outing');
  perform assert_true(o.signed_in_via = 'staff_correction', 'correction recorded as such');

  -- note: explicit column list — staff sessions cannot select pin_hash
  select status into st_status from public.students where id = 'd2000000-0000-0000-0000-00000000000d';
  perform assert_true(st_status = 'in', 'student back in after correction');
end $$;
commit;

-- ---------------------------------------------------------------------------
-- 16. Student cancels their own pending request
-- ---------------------------------------------------------------------------
do $$
declare
  o public.outings;
begin
  o := public.app_create_request(
    'd2000000-0000-0000-0000-00000000000d',
    '40000000-0000-0000-0000-000000000004',
    null, now() + interval '4 hours', null, 'student',
    'd2000000-0000-0000-0000-00000000000d');
  o := public.app_student_cancel('d2000000-0000-0000-0000-00000000000d', o.id);
  perform assert_true(o.status = 'cancelled', 'student can cancel pending request');
end $$;

-- ---------------------------------------------------------------------------
-- 17. Audit log captured the journey
-- ---------------------------------------------------------------------------
do $$
begin
  perform assert_true(
    (select count(*) from public.audit_log where action = 'outing.signed_out') >= 2,
    'sign-outs audited');
  perform assert_true(
    (select count(*) from public.audit_log where action = 'outing.approved') >= 1,
    'approvals audited');
  perform assert_true(
    (select count(*) from public.audit_log where action = 'outing.signed_in' and meta->>'via' = 'staff_correction') >= 1,
    'manual corrections audited');
end $$;

-- ---------------------------------------------------------------------------
-- 18. PIN lockout: 5 consecutive failures lock for 5 minutes; success resets
-- ---------------------------------------------------------------------------
do $$
declare
  sam constant uuid := 'd1000000-0000-0000-0000-00000000000d';
  fails integer;
  locked timestamptz;
begin
  perform public.app_pin_attempt(array[sam], null);
  perform public.app_pin_attempt(array[sam], null);
  perform public.app_pin_attempt(array[sam], null);
  perform public.app_pin_attempt(array[sam], null);

  select failed_pin_attempts, locked_until into fails, locked from public.students where id = sam;
  perform assert_true(fails = 4 and locked is null, 'four failures: counted, not locked');

  perform public.app_pin_attempt(array[sam], null);
  select failed_pin_attempts, locked_until into fails, locked from public.students where id = sam;
  perform assert_true(locked > now() + interval '4 minutes', 'fifth failure locks ~5 minutes');
  perform assert_true(fails = 0, 'counter resets when the lock lands');

  perform public.app_pin_attempt(array[sam], sam);
  select failed_pin_attempts, locked_until into fails, locked from public.students where id = sam;
  perform assert_true(fails = 0 and locked is null, 'successful login clears the lock');
end $$;

select 'state machine tests passed' as result;
