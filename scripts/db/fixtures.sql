-- Deterministic fixtures for the SQL tests (test database only).

insert into auth.users (id, email) values
  ('a1000000-0000-0000-0000-00000000000a', 'alice@school.test'),
  ('b1000000-0000-0000-0000-00000000000b', 'bob@school.test'),
  ('c1000000-0000-0000-0000-00000000000c', 'zara@school.test');

insert into public.houses (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Heron House'),
  ('22222222-2222-2222-2222-222222222222', 'Kestrel House');

insert into public.staff (id, full_name, email, role, house_id) values
  ('a1000000-0000-0000-0000-00000000000a', 'Alice Heron',  'alice@school.test', 'staff',      '11111111-1111-1111-1111-111111111111'),
  ('b1000000-0000-0000-0000-00000000000b', 'Bob Kestrel',  'bob@school.test',   'staff',      '22222222-2222-2222-2222-222222222222'),
  ('c1000000-0000-0000-0000-00000000000c', 'Zara Deputy',  'zara@school.test',  'leadership', null);

insert into public.students (id, house_id, full_name, room, year_group, pin_hash, qr_token, status) values
  ('d1000000-0000-0000-0000-00000000000d', '11111111-1111-1111-1111-111111111111', 'Sam Field',  '12', 'Y10', '$2a$10$testhashtesthashtesthashtex', 'qr-sam',  'in'),
  ('d2000000-0000-0000-0000-00000000000d', '11111111-1111-1111-1111-111111111111', 'Mia Brook',  '7',  'Y11', '$2a$10$testhashtesthashtesthashtex', 'qr-mia',  'in'),
  ('e1000000-0000-0000-0000-00000000000e', '22222222-2222-2222-2222-222222222222', 'Ben Marsh',  '3',  'Y9',  '$2a$10$testhashtesthashtesthashtex', 'qr-ben',  'in');

insert into public.locations (id, house_id, name, requires_permission) values
  ('30000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Sports Hall', false),
  ('40000000-0000-0000-0000-000000000004', null,                                   'Town',        true),
  ('50000000-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222', 'Library',     false);

insert into public.stations (id, house_id, name, token_hash) values
  ('60000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'Heron office iPad', 'stubhash');
