-- Add session_state column to user_data.
-- Stores the user's last active character, foe, expedition, and initiative map
-- so the UI restores correctly across devices and after logout.

ALTER TABLE user_data
  ADD COLUMN IF NOT EXISTS session_state JSONB NOT NULL DEFAULT '{}';
