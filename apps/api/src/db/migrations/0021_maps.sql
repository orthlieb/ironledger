-- =============================================================================
-- Migration 0021: multi-map foundation
--
-- Users have asked for more than one map (a regional overview + optional
-- sub-maps for sites/journeys/communities). Replaces the single-row
-- `user_maps` table with a `maps` table keyed by its own id, with
-- reserved `owner_kind`/`owner_id` columns for Phase 3 entity-attachment.
--
-- Migration path:
--   1. Create `maps`, with RLS + grants mirroring user_maps.
--   2. Copy each user's existing user_maps row into `maps` as
--      "Regional Map" (sort_order 0, no owner).
--   3. Migrate the entity_id on user_entity_portraits rows kind='map' from
--      the fixed 'MAP' sentinel to the new per-user map id — the
--      background-image blob store now keys by mapId so per-map uploads
--      don't collide.
--   4. Track the user's currently-open map via a new
--      `user_data.session_state.activeMapId` field (JSONB — no schema
--      change needed; documented here for reference).
--   5. Drop `user_maps` — its data has moved.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS maps (
  id               UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL DEFAULT 'Untitled Map',
  sort_order       INT         NOT NULL DEFAULT 0,
  -- Phase 3 will attach a map to an entity via (owner_kind, owner_id).
  -- Nullable + reserved now so we don't need another migration then.
  owner_kind       TEXT        NULL,
  owner_id         TEXT        NULL,
  markers          JSONB       NOT NULL DEFAULT '[]'::jsonb,
  background_hash  TEXT        NULL,
  settings         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One map per (kind, id) per user — a Community can't have two maps
  -- attached. NULL/NULL (regional maps) are treated as distinct, so a
  -- user can have many standalone maps without violating the constraint.
  CONSTRAINT maps_owner_unique_per_user UNIQUE (user_id, owner_kind, owner_id)
);

CREATE INDEX IF NOT EXISTS maps_user_idx ON maps (user_id, sort_order);

-- RLS + grants — same shape as user_maps had.
ALTER TABLE maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE maps FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS maps_isolation ON maps;
CREATE POLICY maps_isolation ON maps
  FOR ALL TO app_user
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON maps TO app_user;
GRANT ALL ON maps TO app_admin;

-- Copy existing single map into the new table as "Regional Map".
INSERT INTO maps (user_id, name, sort_order, markers, background_hash, settings, updated_at)
SELECT user_id, 'Regional Map', 0, markers, background_hash, settings, updated_at
FROM user_maps
WHERE user_id IS NOT NULL;

-- Repoint the portrait row for each user's map background from the
-- fixed 'MAP' sentinel to the new per-user map id, so a per-map upload
-- flow can key by mapId without colliding.
UPDATE user_entity_portraits p
SET entity_id = m.id::text
FROM maps m
WHERE p.kind = 'map'
  AND p.entity_id = 'MAP'
  AND m.user_id = p.user_id
  -- Only the initial Regional Map exists at migration time, so this
  -- match is unambiguous per user. Guard on name anyway for clarity.
  AND m.name = 'Regional Map';

DROP TABLE user_maps;

COMMIT;
