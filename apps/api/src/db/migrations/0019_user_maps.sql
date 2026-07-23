-- =============================================================================
-- Migration 0019: server-side campaign map storage
--
-- Tier 1a shipped the map to localStorage. Users asked for server storage so
-- the map syncs across devices (a browser wipe or a new machine had been
-- losing all their work).
--
-- Two changes:
--
--   1. Widen the user_entity_portraits.kind CHECK constraint so the existing
--      content-addressed portrait blob store can hold map background images
--      too. Reuses portrait_blobs (dedupe by md5), portrait_blob GC, RLS
--      policies, and the entire portraitService flow — a map is just one
--      more kind with a fixed entity_id of 'MAP'.
--
--   2. New user_maps table for the per-user map metadata (markers array +
--      background hash pointer). One row per user, PK by user_id, so
--      GET /session/map is a single-row lookup.
--
-- No backfill — Tier 1a was localStorage-only, so no server data exists to
-- migrate. Client wipes its localStorage payload on first load under the new
-- storage model (documented in mapStore.svelte.ts).
-- =============================================================================

-- ── Widen kind CHECK to allow 'map' ─────────────────────────────────────────
ALTER TABLE user_entity_portraits
  DROP CONSTRAINT IF EXISTS user_entity_portraits_kind_check;
ALTER TABLE user_entity_portraits
  ADD CONSTRAINT user_entity_portraits_kind_check
    CHECK (kind IN ('encounter', 'expedition', 'community', 'npc', 'character', 'place', 'map'));

-- ── user_maps — one row per user, holds markers + a background-blob ref ────
CREATE TABLE IF NOT EXISTS user_maps (
  user_id          UUID        NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  markers          JSONB       NOT NULL DEFAULT '[]'::jsonb,
  background_hash  TEXT,       -- FK-in-spirit to portrait_blobs(hash); NULL when no image
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS + grants mirror portrait_blobs / user_entity_portraits.
ALTER TABLE user_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_maps FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_maps_isolation ON user_maps;
CREATE POLICY user_maps_isolation ON user_maps
  FOR ALL TO app_user
  USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON user_maps TO app_user;
GRANT ALL ON user_maps TO app_admin;
