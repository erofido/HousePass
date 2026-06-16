-- Rotating QR codes (TOTP-style, anti-screenshot).
--
-- Each student gets a per-student secret. The phone app derives a short code
-- from it that changes every few seconds; the kiosk verifies it against the
-- SERVER clock. qr_token stays as the (non-secret) lookup id in the payload.
--
-- qr_secret is sensitive (like pin_hash): it is NOT in the column-level grant
-- to authenticated, so staff/anon can never read it — only the service role
-- (the student's own /api/student/me) hands it to the signed-in student.

alter table public.students
  add column qr_secret    text   not null default encode(gen_random_bytes(20), 'hex'),
  -- highest time-step already accepted for this student; blocks replay of a
  -- captured code within its validity window.
  add column last_qr_step bigint not null default 0;
