-- =============================================================================
-- Migration 0017: allow the 'gemini' AI provider
--
-- Phase 3 adds Google Gemini alongside Claude and ChatGPT. Widen the provider
-- CHECK constraint so ai_config rows may be keyed by 'gemini'. Everything else
-- about the table (RLS, one-active index, encrypted key columns) is unchanged.
-- Idempotent — safe to run on a fresh install or re-run.
-- =============================================================================

ALTER TABLE ai_config DROP CONSTRAINT IF EXISTS ai_config_provider_chk;
ALTER TABLE ai_config
  ADD CONSTRAINT ai_config_provider_chk CHECK (provider IN ('claude', 'chatgpt', 'gemini'));
