-- =============================================================================
-- Migration 0004: Fix RLS policies to handle empty-string GUC reset
--
-- Root cause:
--   PostgreSQL custom GUCs (e.g. app.user_id) have '' as their default
--   "reset value".  When set_config('app.user_id', userId, true) (LOCAL)
--   runs for the first time on a connection, PostgreSQL records '' as the
--   session-level "before" state.  When the transaction commits, the GUC is
--   restored to '' — not NULL.
--
--   As a result, any subsequent query on that pooled connection evaluates the
--   RLS policy as: '' ::uuid — which throws:
--     "invalid input syntax for type uuid: ''"
--
-- Fix:
--   Wrap current_setting() in NULLIF(..., '') so that an empty string is
--   coerced to NULL before the ::uuid cast.  NULL::uuid is NULL, which makes
--   the equality test return NULL (false), so no rows are visible — the safe
--   default for an unauthenticated connection.
-- =============================================================================

-- users
DROP POLICY IF EXISTS users_isolation ON users;
CREATE POLICY users_isolation ON users
  FOR ALL TO app_user
  USING (id = NULLIF(current_setting('app.user_id', true), '')::uuid);

-- refresh_tokens
DROP POLICY IF EXISTS refresh_tokens_isolation ON refresh_tokens;
CREATE POLICY refresh_tokens_isolation ON refresh_tokens
  FOR ALL TO app_user
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);

-- auth_tokens
DROP POLICY IF EXISTS auth_tokens_isolation ON auth_tokens;
CREATE POLICY auth_tokens_isolation ON auth_tokens
  FOR ALL TO app_user
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);

-- characters
DROP POLICY IF EXISTS characters_isolation ON characters;
CREATE POLICY characters_isolation ON characters
  FOR ALL TO app_user
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);

-- history_entries
DROP POLICY IF EXISTS history_isolation ON history_entries;
CREATE POLICY history_isolation ON history_entries
  FOR ALL TO app_user
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);

-- user_data
DROP POLICY IF EXISTS user_data_self ON user_data;
CREATE POLICY user_data_self ON user_data
  FOR ALL TO app_user
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
