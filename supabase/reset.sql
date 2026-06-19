-- HousePass reset.
--
-- Use this ONLY during setup, if applying the migrations errored partway
-- (e.g. "relation \"houses\" already exists") and you want a clean slate.
-- It removes every HousePass object so supabase/all_migrations.sql can be
-- run again from scratch. It does NOT touch Supabase's own auth data.
--
-- WARNING: this deletes all HousePass tables and their contents. Only run it
-- before the house is in real use.

-- Drop the dependent view first, then the tables (CASCADE clears indexes,
-- policies, the realtime publication membership and the SECURITY DEFINER
-- functions whose signatures reference these row types).
drop view if exists public.live_board cascade;

drop table if exists public.push_subscriptions cascade;
drop table if exists public.curfews  cascade;
drop table if exists public.audit_log cascade;
drop table if exists public.outings  cascade;
drop table if exists public.stations cascade;
drop table if exists public.locations cascade;
drop table if exists public.students cascade;
drop table if exists public.staff    cascade;
drop table if exists public.houses   cascade;

-- Helper predicates and any remaining HousePass functions.
drop schema if exists app cascade;

drop function if exists public.api_approve_outing(uuid, timestamptz);
drop function if exists public.api_deny_outing(uuid);
drop function if exists public.api_update_expected_back(uuid, timestamptz);
drop function if exists public.api_mark_back_in(uuid);
drop function if exists public.app_create_request(uuid, uuid, text, timestamptz, text, text, uuid);
drop function if exists public.app_station_sign_out(uuid, uuid, text, uuid);
drop function if exists public.app_station_start(uuid, uuid, uuid, timestamptz, text, uuid);
drop function if exists public.app_station_sign_in(uuid, uuid, text, uuid);
drop function if exists public.app_student_cancel(uuid, uuid);
drop function if exists public.app_pin_attempt(uuid[], uuid);

-- Now run supabase/all_migrations.sql again.
