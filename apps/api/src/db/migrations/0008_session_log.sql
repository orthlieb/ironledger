-- Create session_log_entries table.
-- One row per log entry, stored as JSONB so the LogEntry shape can evolve
-- without further migrations. occurred_at is promoted to a real column for
-- efficient ORDER BY / cursor pagination.
-- The rolling 1000-entry cap is enforced in the application layer on INSERT.

CREATE TABLE IF NOT EXISTS session_log_entries (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_id    TEXT        NOT NULL,
  entry       JSONB       NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT session_log_entries_user_entry_uniq UNIQUE (user_id, entry_id)
);

CREATE INDEX IF NOT EXISTS session_log_entries_user_occurred_idx
  ON session_log_entries (user_id, occurred_at DESC);

-- Allow app_user to read and write their own rows only
ALTER TABLE session_log_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_log_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY session_log_entries_isolation ON session_log_entries
  FOR ALL TO app_user
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);

-- Grant app_user full CRUD on session_log_entries
GRANT SELECT, INSERT, UPDATE, DELETE ON session_log_entries TO app_user;

-- Grant app_admin full access (bypasses RLS for migrations/admin tools)
GRANT ALL ON session_log_entries TO app_admin;
