/**
 * Foe portrait URL resolver.
 *
 * Portraits live in static/foes/<slug>.webp where <slug> is the foe's
 * display name converted to kebab-case: lowercase, runs of whitespace
 * replaced with a single dash, existing hyphens preserved.
 *
 *   "Bear"                 → /foes/bear.webp
 *   "Circle of Stones"     → /foes/circle-of-stones.webp
 *   "Iron-Wracked Beast"   → /foes/iron-wracked-beast.webp
 *
 * Call sites that need a fallback on 404 should use UNKNOWN_FOE_PORTRAIT.
 */

export function foePortraitUrl(name: string): string {
	const slug = name.toLowerCase().replace(/\s+/g, '-');
	return `/foes/${slug}.webp`;
}

export const UNKNOWN_FOE_PORTRAIT = '/foes/unknown-foe.webp';
