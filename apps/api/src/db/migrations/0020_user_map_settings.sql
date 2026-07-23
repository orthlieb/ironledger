-- =============================================================================
-- Migration 0020: user_maps.settings JSONB
--
-- Per-map settings live server-side so a GM's scale (miles/km + distance
-- per hex) travels with the map across devices. Border + hex-grid
-- visibility remain per-device (localStorage) because they're display
-- preferences, not properties of the map itself.
--
-- Shape (all optional, client fills defaults for missing keys):
--   {
--     "scale": { "enabled": bool, "unit": "miles"|"km",
--                "perHex": number, "segments": number }
--   }
--
-- Backfill: empty object (defaults substituted by the client on read).
-- =============================================================================

ALTER TABLE user_maps
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;
