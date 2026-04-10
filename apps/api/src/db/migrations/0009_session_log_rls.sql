-- =============================================================================
-- Migration 0009: Add missing RLS + grants for session_log_entries
--
-- Migration 0008 created the session_log_entries table but omitted the RLS
-- policy and GRANT statements that app_user needs to read/write its own rows.
-- Without these, every request to /api/v1/session/log returns a 500.
--
-- This migration is idempotent: safe to run against databases where 0008 was
-- applied without the grants, and safe to run again on a fresh install.
-- =============================================================================

ALTER TABLE session_log_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_log_entries FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS session_log_entries_isolation ON session_log_entries;
CREATE POLICY session_log_entries_isolation ON session_log_entries
  FOR ALL TO app_user
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON session_log_entries TO app_user;
GRANT ALL ON session_log_entries TO app_admin;
