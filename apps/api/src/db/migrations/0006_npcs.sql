-- Add npcs column to user_data.
-- Stores standalone NPC cards (separated from communities so NPCs can travel
-- independently of any settlement).

ALTER TABLE user_data
  ADD COLUMN IF NOT EXISTS npcs JSONB NOT NULL DEFAULT '[]';
