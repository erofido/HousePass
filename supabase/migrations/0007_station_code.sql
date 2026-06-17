-- Rotating station code (shown on the office iPad, scanned by phones).
--
-- The iPad displays a QR that rotates like the student pass. A phone scans it
-- to sign out / in; the server checks the code against ITS clock, proving the
-- phone was physically at that office screen within the last few seconds.
-- Service-role only (stations table has no client grants), like the pairing
-- token.
alter table public.stations
  add column code_secret text not null default encode(gen_random_bytes(20), 'hex');
