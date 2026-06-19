-- HousePass — Bromsgrove School personalisation.
--
-- Adds all 16 houses, the common destinations, and curfew times by year
-- group. Safe to run more than once (idempotent). Paste into the Supabase
-- SQL editor and Run. Requires the migrations (0001–0008) to be applied
-- first.
--
-- NOTE on the existing demo house: the initial seed created "Heron House"
-- with 10 students, a staff login and a paired station. To reuse that
-- working data under a real house name, rename it in the app
-- (Staff → Manage → Boarding houses → Rename) — e.g. Heron House → Elmhurst.
-- Leaving it as-is is also fine; it just appears as an extra house.

-- ---------------------------------------------------------------------------
-- 1. Houses (name is unique; existing ones are skipped)
-- ---------------------------------------------------------------------------
insert into public.houses (name) values
  -- Day Houses — Boys
  ('Lupton'),
  ('Lyttelton'),
  ('School'),
  ('Walters'),
  -- Day Houses — Girls
  ('Hazeldene'),
  ('Ottilie Hild'),
  ('Thomas Cookes'),
  -- Boarding — Boys
  ('Elmhurst'),
  ('Wendron-Gordon'),
  ('Webber'),
  -- Boarding — Girls
  ('Mary Windsor'),
  ('Oakley'),
  -- Co-Ed Sixth Form
  ('Houseman Hall'),
  -- Co-Ed Prep
  ('Page')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Destinations (global — available to every house)
--    Town/off-site needs a teacher's approval; the rest are self-service.
--    Visiting another boarding house is offered as its own destination.
-- ---------------------------------------------------------------------------
insert into public.locations (house_id, name, requires_permission)
select null, v.name, v.perm
from (values
  ('Town',                 true),
  ('Astro',                false),
  ('Library',              false),
  ('Cafe',                 false),
  ('Visit: Elmhurst',       false),
  ('Visit: Wendron-Gordon', false),
  ('Visit: Webber',         false),
  ('Visit: Mary Windsor',   false),
  ('Visit: Oakley',         false),
  ('Visit: Houseman Hall',  false),
  ('Visit: Page',           false)
) as v(name, perm)
where not exists (
  select 1 from public.locations l
  where l.house_id is null and lower(l.name) = lower(v.name)
);

-- ---------------------------------------------------------------------------
-- 3. Curfews by year group, applied to every house.
--    Evening "back by" times:
--      Lower Fourth 21:30 · Upper Fourth 21:45 · Fifth Form 22:00
--      Lower Sixth 22:15 · Upper Sixth 22:15
--    (Students must be recorded with these exact year-group names for the
--     curfew to pre-fill — see the note at the end.)
-- ---------------------------------------------------------------------------
insert into public.curfews (house_id, year_group, back_by)
select h.id, y.year_group, y.back_by::time
from public.houses h
cross join (values
  ('Lower Fourth', '21:30'),
  ('Upper Fourth', '21:45'),
  ('Fifth Form',   '22:00'),
  ('Lower Sixth',  '22:15'),
  ('Upper Sixth',  '22:15')
) as y(year_group, back_by)
on conflict (house_id, year_group) do update
  set back_by = excluded.back_by;

-- Done. Verify:
--   select name from public.houses order by name;
--   select name, requires_permission from public.locations where house_id is null;
--   select count(*) from public.curfews;
