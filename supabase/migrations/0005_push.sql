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
