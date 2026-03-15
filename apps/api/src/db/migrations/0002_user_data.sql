-- =============================================================================
-- Migration 0002: Add user_data table
--
-- Stores global (non-character) game state per user:
--   • encounters — active foe encounters
--   • expeditions — active journey/site expeditions (future)
--
-- One row per user, upserted on every write.
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_data (
  user_id     UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  encounters  JSONB       NOT NULL DEFAULT '[]',
  expeditions JSONB       NOT NULL DEFAULT '[]',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Allow app_user to read and write their own row only
ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_data_self ON user_data
  USING (user_id = current_setting('app.user_id', true)::uuid);

-- Grant app_user full CRUD on user_data
GRANT SELECT, INSERT, UPDATE, DELETE ON user_data TO app_user;
