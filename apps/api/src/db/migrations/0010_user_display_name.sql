-- Add display_name to users.
-- Shown in UI greetings, admin Users table, and future session-shared views.
-- Backfills existing rows from email so the NOT NULL constraint holds.
-- New accounts (registration + invite) default display_name to email when the
-- user leaves the optional field blank — enforced at the service layer, not here.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS display_name TEXT;

UPDATE users SET display_name = email WHERE display_name IS NULL;

ALTER TABLE users
  ALTER COLUMN display_name SET NOT NULL;
