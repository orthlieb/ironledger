-- =============================================================================
-- Migration 0016: AI companion per-provider config
--
-- Stores each user's AI companion configuration, one row per provider
-- (claude | chatgpt). The provider API key is stored encrypted at rest
-- (AES-256-GCM — ciphertext/iv/tag); the plaintext is never persisted or
-- returned to a client. At most one provider may be `active` per user
-- (a null/no-active-row state means the "None" companion).
--
-- RLS + grants mirror session_log_entries: app_user sees only its own rows.
-- Idempotent — safe to run on a fresh install or re-run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS ai_config (
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider       text NOT NULL,
  key_ciphertext text,
  key_iv         text,
  key_tag        text,
  model          text,
  setup          text,
  active         boolean NOT NULL DEFAULT false,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider),
  CONSTRAINT ai_config_provider_chk CHECK (provider IN ('claude', 'chatgpt'))
);

-- At most one active provider per user.
CREATE UNIQUE INDEX IF NOT EXISTS ai_config_one_active_idx
  ON ai_config (user_id) WHERE active;

ALTER TABLE ai_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_config FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_config_isolation ON ai_config;
CREATE POLICY ai_config_isolation ON ai_config
  FOR ALL TO app_user
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON ai_config TO app_user;
GRANT ALL ON ai_config TO app_admin;
