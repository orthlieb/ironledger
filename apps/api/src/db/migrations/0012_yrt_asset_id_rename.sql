-- Rename two YRT Path asset IDs to match their new user-facing names.
-- The user-visible names changed earlier (Falsinto → Bittercraft, Venenigisto → Quillwise);
-- now the IDs follow.
--
--   path/yrt-venenigisto → path/yrt-bittercraft
--   path/yrt-falsinto    → path/yrt-quillwise
--
-- CharacterAsset rows reference assets by id (characters.data->'assets'[*]->'assetId'),
-- so any character that previously enabled either Path needs its assetId remapped —
-- otherwise findAsset() returns undefined and the asset shows as "Loading…" forever.
--
-- Rewrite is in-place per asset entry: only assetId is touched, every other field
-- (abilities[], rarityId, selections, customValues) is preserved unchanged. Rows
-- with no matching old IDs are skipped entirely.

UPDATE characters
SET data = jsonb_set(
  data,
  '{assets}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN elem->>'assetId' = 'path/yrt-venenigisto'
          THEN jsonb_set(elem, '{assetId}', '"path/yrt-bittercraft"'::jsonb)
        WHEN elem->>'assetId' = 'path/yrt-falsinto'
          THEN jsonb_set(elem, '{assetId}', '"path/yrt-quillwise"'::jsonb)
        ELSE elem
      END
    )
    FROM jsonb_array_elements(data->'assets') AS elem
  ),
  false
)
WHERE jsonb_typeof(data->'assets') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(data->'assets') AS elem
    WHERE elem->>'assetId' IN ('path/yrt-venenigisto', 'path/yrt-falsinto')
  );
