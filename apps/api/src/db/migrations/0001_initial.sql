-- =============================================================================
-- Migration 0001: Initial schema
--
-- Creates the two database roles, all tables, indexes, RLS policies,
-- and the updated_at trigger.
--
-- Run as app_admin (superuser or role with CREATEROLE privilege).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Roles
--
-- app_admin: bypasses RLS. Used only for migrations and admin scripts.
--            NEVER used by the running API server.
--
-- app_user:  subject to RLS. The API server connects as this role.
--            Can only see/modify its own rows.
--
-- These roles have NO LOGIN — they are not database users you connect with
-- directly. Instead, your DATABASE_URL specifies a login user that has been
-- granted membership in one of these roles.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_admin') THEN
    CREATE ROLE app_admin;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT        NOT NULL UNIQUE,
  email_verified_at   TIMESTAMPTZ,
  password_hash       TEXT        NOT NULL,
  is_active           BOOLEAN     NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at       TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,
  family_id   UUID        NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent  TEXT,
  ip_address  INET
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,
  purpose     TEXT        NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS characters (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  data        JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS history_entries (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id  UUID        NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  entry_html    TEXT        NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS security_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID,       -- no FK: keep audit trail even if user is deleted
  event_type  TEXT        NOT NULL,
  ip_address  INET,
  user_agent  TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx   ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_family_id_idx ON refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS auth_tokens_user_id_idx       ON auth_tokens(user_id);
CREATE INDEX IF NOT EXISTS characters_user_id_idx        ON characters(user_id);
CREATE INDEX IF NOT EXISTS history_entries_char_id_idx   ON history_entries(character_id);
CREATE INDEX IF NOT EXISTS history_entries_occurred_idx  ON history_entries(occurred_at);
CREATE INDEX IF NOT EXISTS security_events_user_id_idx   ON security_events(user_id);
CREATE INDEX IF NOT EXISTS security_events_type_idx      ON security_events(event_type);
CREATE INDEX IF NOT EXISTS security_events_created_idx   ON security_events(created_at);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- Automatically updates characters.updated_at on every UPDATE.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS characters_updated_at ON characters;
CREATE TRIGGER characters_updated_at
  BEFORE UPDATE ON characters
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

-- Enable RLS on all tables that hold user data
ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_tokens    ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters     ENABLE ROW LEVEL SECURITY;
ALTER TABLE history_entries ENABLE ROW LEVEL SECURITY;
-- security_events intentionally has NO RLS — app_user cannot read it at all

-- app_admin bypasses RLS entirely (used for migrations and admin tools)
ALTER TABLE users           FORCE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens  FORCE ROW LEVEL SECURITY;
ALTER TABLE auth_tokens     FORCE ROW LEVEL SECURITY;
ALTER TABLE characters      FORCE ROW LEVEL SECURITY;
ALTER TABLE history_entries FORCE ROW LEVEL SECURITY;

-- users: a user can only see and modify their own row
CREATE POLICY users_isolation ON users
  FOR ALL TO app_user
  USING (id = current_setting('app.user_id', true)::uuid);

-- refresh_tokens: a user can only see their own tokens
CREATE POLICY refresh_tokens_isolation ON refresh_tokens
  FOR ALL TO app_user
  USING (user_id = current_setting('app.user_id', true)::uuid);

-- auth_tokens: a user can only see their own tokens
CREATE POLICY auth_tokens_isolation ON auth_tokens
  FOR ALL TO app_user
  USING (user_id = current_setting('app.user_id', true)::uuid);

-- characters: a user can only see their own characters
CREATE POLICY characters_isolation ON characters
  FOR ALL TO app_user
  USING (user_id = current_setting('app.user_id', true)::uuid);

-- history_entries: a user can only see their own history
CREATE POLICY history_isolation ON history_entries
  FOR ALL TO app_user
  USING (user_id = current_setting('app.user_id', true)::uuid);

-- ---------------------------------------------------------------------------
-- Permissions
--
-- app_user can SELECT/INSERT/UPDATE/DELETE on user data tables.
-- app_user cannot touch security_events (write-only via app_admin functions,
-- or via a SECURITY DEFINER function that we add later).
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON users          TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON refresh_tokens TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_tokens    TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON characters     TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON history_entries TO app_user;
GRANT INSERT                          ON security_events TO app_user;
-- app_user can INSERT security events but NOT read or delete them

GRANT ALL ON ALL TABLES IN SCHEMA public TO app_admin;
