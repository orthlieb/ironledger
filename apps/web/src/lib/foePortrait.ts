/**
 * Foe portrait URL helpers.
 *
 * Each foe definition in apps/api/data/foes/*.json carries an `images`
 * array of filenames relative to /foes/, with the primary (picker /
 * thumbnail) listed first:
 *
 *   { "name": "Bear",  "images": ["bear.webp"] }
 *   { "name": "Locus", "images": ["locus-azure.webp", "locus-crimson.webp", …] }
 *
 * These helpers prepend the /foes/ path and handle the missing-images
 * fallback. No runtime discovery, no manifest fetch — the array is the
 * single source of truth, shipped alongside the rest of the foe data.
 */

export const UNKNOWN_FOE_PORTRAIT = '/foes/unknown-foe.webp';

/** Foe display name → kebab-case slug (lowercase, spaces → '-'). */
function slug(name: string): string {
	return name.toLowerCase().replace(/\s+/g, '-');
}

/**
 * URL for a specific image in a foe's list. Pass the foe's `images` array
 * straight from its definition. `index` is 0-based and clamped.
 *
 * If `images` is missing or empty, falls back to /foes/<slug>.webp — a
 * safety net for foes whose data hasn't been migrated yet; the onerror
 * handlers on `<img>` still drop to UNKNOWN_FOE_PORTRAIT if that 404s.
 */
export function foePortraitUrl(
	name: string,
	images?: readonly string[] | null,
	index = 0,
): string {
	if (images && images.length > 0) {
		const safe = Math.min(Math.max(index, 0), images.length - 1);
		return `/foes/${images[safe]}`;
	}
	return index <= 0 ? `/foes/${slug(name)}.webp` : UNKNOWN_FOE_PORTRAIT;
}
