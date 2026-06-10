-- On hosted Supabase the service_role is granted everything by default
-- privileges. Mirror that for the local test database (it also has BYPASSRLS
-- from the stub) so tests can act "as the trusted server".

grant usage on schema app to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
grant execute on all functions in schema app to service_role;
