-- =============================================================================
-- Migration 0014: content-addressed portrait storage
--
-- Portraits (community / npc / expedition imageUrl, character data.portrait)
-- were inlined as base64 data URLs inside the entity JSON, so every GET
-- /session and every character list dragged the full image payload along.
--
-- This moves the bytes into two tables:
--
--   portrait_blobs        — (user_id, hash) → mime, bytes. Content-addressed:
--                           the same image stored twice (e.g. on import)
--                           collapses to one row, never duplicated.
--   user_entity_portraits — (user_id, kind, entity_id) → hash. A thin reference
--                           from each entity to its blob.
--
-- The entity JSON keeps only a lightweight `portraitEtag` (= the hash), which
-- the client uses to render <img src=".../portrait?v=<etag>"> and cache-bust.
--
-- The hash is md5(bytes) — computed identically here and in portraitService so
-- backfilled rows and freshly-uploaded rows agree on the same ETag.
-- =============================================================================

CREATE TABLE IF NOT EXISTS portrait_blobs (
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hash       TEXT        NOT NULL,
  mime       TEXT        NOT NULL,
  bytes      BYTEA       NOT NULL,
  byte_len   INTEGER     NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT portrait_blobs_pkey PRIMARY KEY (user_id, hash)
);

CREATE TABLE IF NOT EXISTS user_entity_portraits (
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT        NOT NULL CHECK (kind IN ('encounter', 'expedition', 'community', 'npc', 'character')),
  entity_id  TEXT        NOT NULL,
  hash       TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_entity_portraits_pkey PRIMARY KEY (user_id, kind, entity_id)
);

-- Find every entity that references a given blob (used to GC orphaned blobs).
CREATE INDEX IF NOT EXISTS user_entity_portraits_user_hash_idx
  ON user_entity_portraits (user_id, hash);

-- ── Backfill — session collections (entity->>'imageUrl') ────────────────────
-- Only inline base64 data URLs are migrated; the regex skips https URLs (which
-- are tiny and may stay inline). The blob is keyed by content hash, so two
-- entities sharing an image insert one blob row.

INSERT INTO portrait_blobs (user_id, hash, mime, bytes, byte_len)
SELECT DISTINCT ON (ue.user_id, md5(decode(substring(ue.entity->>'imageUrl' FROM 'base64,(.*)$'), 'base64')))
  ue.user_id,
  md5(decode(substring(ue.entity->>'imageUrl' FROM 'base64,(.*)$'), 'base64')),
  substring(ue.entity->>'imageUrl' FROM 'data:([^;]+);base64'),
  decode(substring(ue.entity->>'imageUrl' FROM 'base64,(.*)$'), 'base64'),
  octet_length(decode(substring(ue.entity->>'imageUrl' FROM 'base64,(.*)$'), 'base64'))
FROM user_entities ue
WHERE ue.entity->>'imageUrl' LIKE 'data:image/%;base64,%'
ON CONFLICT (user_id, hash) DO NOTHING;

INSERT INTO user_entity_portraits (user_id, kind, entity_id, hash)
SELECT
  ue.user_id, ue.kind, ue.entity_id,
  md5(decode(substring(ue.entity->>'imageUrl' FROM 'base64,(.*)$'), 'base64'))
FROM user_entities ue
WHERE ue.entity->>'imageUrl' LIKE 'data:image/%;base64,%'
ON CONFLICT (user_id, kind, entity_id) DO NOTHING;

UPDATE user_entities ue
SET entity = (ue.entity - 'imageUrl') || jsonb_build_object('portraitEtag', p.hash)
FROM user_entity_portraits p
WHERE p.user_id = ue.user_id AND p.kind = ue.kind AND p.entity_id = ue.entity_id;

-- ── Backfill — characters (data->>'portrait') ───────────────────────────────

INSERT INTO portrait_blobs (user_id, hash, mime, bytes, byte_len)
SELECT DISTINCT ON (c.user_id, md5(decode(substring(c.data->>'portrait' FROM 'base64,(.*)$'), 'base64')))
  c.user_id,
  md5(decode(substring(c.data->>'portrait' FROM 'base64,(.*)$'), 'base64')),
  substring(c.data->>'portrait' FROM 'data:([^;]+);base64'),
  decode(substring(c.data->>'portrait' FROM 'base64,(.*)$'), 'base64'),
  octet_length(decode(substring(c.data->>'portrait' FROM 'base64,(.*)$'), 'base64'))
FROM characters c
WHERE c.data->>'portrait' LIKE 'data:image/%;base64,%'
ON CONFLICT (user_id, hash) DO NOTHING;

INSERT INTO user_entity_portraits (user_id, kind, entity_id, hash)
SELECT
  c.user_id, 'character', c.id::text,
  md5(decode(substring(c.data->>'portrait' FROM 'base64,(.*)$'), 'base64'))
FROM characters c
WHERE c.data->>'portrait' LIKE 'data:image/%;base64,%'
ON CONFLICT (user_id, kind, entity_id) DO NOTHING;

UPDATE characters c
SET data = (c.data - 'portrait') || jsonb_build_object('portraitEtag', p.hash)
FROM user_entity_portraits p
WHERE p.kind = 'character' AND p.entity_id = c.id::text AND p.user_id = c.user_id;

-- ── RLS + grants (mirrors user_entities / session_log_entries) ──────────────
ALTER TABLE portrait_blobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE portrait_blobs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS portrait_blobs_isolation ON portrait_blobs;
CREATE POLICY portrait_blobs_isolation ON portrait_blobs
  FOR ALL TO app_user
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON portrait_blobs TO app_user;
GRANT ALL ON portrait_blobs TO app_admin;

ALTER TABLE user_entity_portraits ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_entity_portraits FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_entity_portraits_isolation ON user_entity_portraits;
CREATE POLICY user_entity_portraits_isolation ON user_entity_portraits
  FOR ALL TO app_user
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON user_entity_portraits TO app_user;
GRANT ALL ON user_entity_portraits TO app_admin;
