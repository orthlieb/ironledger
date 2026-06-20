-- =============================================================================
-- Migration 0013: per-entity storage for session collections
--
-- The four session collections (encounters, expeditions, communities, npcs)
-- were stored as whole-array JSONB columns on user_data and rewritten in full
-- on every save. That made each save proportional to the entire collection —
-- and with inline base64 portraits a single collection easily exceeded the
-- request body limit, so it could no longer be saved or imported at all.
--
-- This table stores one row per entity (mirroring session_log_entries) so the
-- app can create/update/delete a single entity per request. `seq` preserves
-- insertion order. The old user_data.{encounters,expeditions,communities,npcs}
-- columns are left in place (now vestigial) so this migration is reversible;
-- a later migration can drop them once the new path has soaked.
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_entities (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT        NOT NULL CHECK (kind IN ('encounter', 'expedition', 'community', 'npc')),
  entity_id  TEXT        NOT NULL,
  entity     JSONB       NOT NULL,
  seq        BIGSERIAL   NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_entities_user_kind_entity_uniq UNIQUE (user_id, kind, entity_id)
);

-- Primary access pattern: list one kind for one user, in insertion order.
CREATE INDEX IF NOT EXISTS user_entities_user_kind_seq_idx
  ON user_entities (user_id, kind, seq);

-- ── Backfill from the legacy user_data JSONB columns ────────────────────────
-- WITH ORDINALITY captures each element's position in the array; ordering the
-- INSERT by it lets the BIGSERIAL `seq` increase in original array order.
-- COALESCE guards rows whose elements somehow lack an id.

INSERT INTO user_entities (user_id, kind, entity_id, entity)
SELECT ud.user_id, 'encounter', COALESCE(elem->>'id', gen_random_uuid()::text), elem
FROM user_data ud, jsonb_array_elements(ud.encounters) WITH ORDINALITY AS t(elem, ord)
WHERE jsonb_typeof(ud.encounters) = 'array'
ORDER BY ud.user_id, ord
ON CONFLICT (user_id, kind, entity_id) DO NOTHING;

INSERT INTO user_entities (user_id, kind, entity_id, entity)
SELECT ud.user_id, 'expedition', COALESCE(elem->>'id', gen_random_uuid()::text), elem
FROM user_data ud, jsonb_array_elements(ud.expeditions) WITH ORDINALITY AS t(elem, ord)
WHERE jsonb_typeof(ud.expeditions) = 'array'
ORDER BY ud.user_id, ord
ON CONFLICT (user_id, kind, entity_id) DO NOTHING;

INSERT INTO user_entities (user_id, kind, entity_id, entity)
SELECT ud.user_id, 'community', COALESCE(elem->>'id', gen_random_uuid()::text), elem
FROM user_data ud, jsonb_array_elements(ud.communities) WITH ORDINALITY AS t(elem, ord)
WHERE jsonb_typeof(ud.communities) = 'array'
ORDER BY ud.user_id, ord
ON CONFLICT (user_id, kind, entity_id) DO NOTHING;

INSERT INTO user_entities (user_id, kind, entity_id, entity)
SELECT ud.user_id, 'npc', COALESCE(elem->>'id', gen_random_uuid()::text), elem
FROM user_data ud, jsonb_array_elements(ud.npcs) WITH ORDINALITY AS t(elem, ord)
WHERE jsonb_typeof(ud.npcs) = 'array'
ORDER BY ud.user_id, ord
ON CONFLICT (user_id, kind, entity_id) DO NOTHING;

-- ── RLS + grants (mirrors session_log_entries) ─────────────────────────────
ALTER TABLE user_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_entities FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_entities_isolation ON user_entities;
CREATE POLICY user_entities_isolation ON user_entities
  FOR ALL TO app_user
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON user_entities TO app_user;
GRANT USAGE, SELECT ON SEQUENCE user_entities_seq_seq TO app_user;
GRANT ALL ON user_entities TO app_admin;
GRANT ALL ON SEQUENCE user_entities_seq_seq TO app_admin;
