-- =============================================================================
-- Migration 0018: drop the vestigial ai_config.setup column
--
-- The AI storyteller's system prompt ("Setup Instructions") is now a single
-- global client-side preference sent with each generate request, not a
-- per-provider server column. Nothing reads or writes ai_config.setup anymore,
-- so remove it. Idempotent — safe to run on a fresh install or re-run.
-- =============================================================================

ALTER TABLE ai_config DROP COLUMN IF EXISTS setup;
