-- Rotating QR: secret column exists, is server-only, replay counter present.
\set ON_ERROR_STOP on

do $$
begin
  perform assert_true(
    (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'students'
       and column_name in ('qr_secret', 'last_qr_step')) = 2,
    'students has qr_secret and last_qr_step');
end $$;

-- every student got a secret by default
do $$
begin
  perform assert_true(
    (select count(*) from public.students where qr_secret is null or length(qr_secret) < 20) = 0,
    'all students have a non-trivial qr_secret');
end $$;

-- qr_secret must NOT be readable by staff/leadership (service-role only),
-- exactly like pin_hash.
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"c1000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
  begin
    perform (select qr_secret from public.students limit 1);
    raise exception 'ASSERT FAILED: qr_secret must not be selectable by clients';
  exception when insufficient_privilege then
    null; -- expected
  end;
end $$;
reset role;

select 'rotating qr tests passed' as result;
