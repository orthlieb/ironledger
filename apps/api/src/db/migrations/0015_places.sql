-- =============================================================================
-- Migration 0015: allow 'place' entities
--
-- Places are a new connection kind alongside communities and NPCs — inns,
-- markets, remote sites (dire forest, ruin). They live in the same
-- user_entities table introduced in 0013; we just widen the kind CHECK
-- constraint to accept the new value. Storage / API / RLS mirror the
-- existing kinds via the KIND_BY_SEGMENT map in userDataService.ts.
-- =============================================================================

ALTER TABLE user_entities
  DROP CONSTRAINT IF EXISTS user_entities_kind_check;

ALTER TABLE user_entities
  ADD CONSTRAINT user_entities_kind_check
    CHECK (kind IN ('encounter', 'expedition', 'community', 'npc', 'place'));
