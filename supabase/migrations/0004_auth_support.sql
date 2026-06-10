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
