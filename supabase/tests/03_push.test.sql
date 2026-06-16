-- Push subscriptions + notification columns.
\set ON_ERROR_STOP on

-- new outing columns exist
do $$
begin
  perform assert_true(
    (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'outings'
       and column_name in ('remind_sent_at', 'overdue_push_sent_at')) = 2,
    'outings has remind_sent_at and overdue_push_sent_at');
end $$;

-- service role can write a subscription
insert into public.push_subscriptions
  (subscriber_type, subscriber_id, house_id, endpoint, p256dh, auth)
values
  ('student', 'd1000000-0000-0000-0000-00000000000d',
   '11111111-1111-1111-1111-111111111111', 'https://push.test/1', 'p', 'a');

do $$
begin
  perform assert_true(
    (select count(*) from public.push_subscriptions) = 1,
    'service role can insert a push subscription');
end $$;

-- authenticated staff (even leadership) cannot read subscriptions
do $$
begin
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"c1000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
    perform (select count(*) from public.push_subscriptions);
    raise exception 'ASSERT FAILED: push_subscriptions must be service-role only';
  exception when insufficient_privilege then
    null; -- expected
  end;
end $$;
reset role;

-- updating the due-back time re-arms all three notification channels
do $$
declare
  oid uuid;
begin
  insert into public.outings (student_id, house_id, location_id, status,
                              expected_back_at, signed_out_at, signed_out_via,
                              late_alerted_at, remind_sent_at, overdue_push_sent_at)
  values ('d1000000-0000-0000-0000-00000000000d',
          '11111111-1111-1111-1111-111111111111',
          '30000000-0000-0000-0000-000000000003', 'out',
          now() - interval '5 min', now() - interval '1 hour', 'kiosk_qr',
          now(), now(), now())
  returning id into oid;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"a1000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

  perform public.api_update_expected_back(oid, now() + interval '30 min');
  reset role;

  perform assert_true(
    (select late_alerted_at is null and remind_sent_at is null and overdue_push_sent_at is null
     from public.outings where id = oid),
    'changing due-back clears all notification timestamps');
end $$;
reset role;

select 'push tests passed' as result;
