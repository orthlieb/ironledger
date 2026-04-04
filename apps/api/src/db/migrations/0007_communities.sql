-- Add communities column to user_data.
-- Stores region/settlement cards alongside the npcs column added in 0006.

ALTER TABLE user_data
  ADD COLUMN IF NOT EXISTS communities JSONB NOT NULL DEFAULT '[]';
