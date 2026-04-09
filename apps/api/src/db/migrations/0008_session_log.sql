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
