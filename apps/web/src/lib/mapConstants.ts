// =============================================================================
// Iron Ledger — Campaign map constants
//
// Tier 1a scope: annotate an uploaded map image on a hex grid overlay. One
// map per user (background image + marker list) stored in localStorage.
// No terrain painting — the background image IS the terrain. Markers are
// hex-pinned annotations (label + icon + optional entity link).
//
// Icon set intentionally small (8 slugs) and drawn from the existing icon
// vocabulary in $icons/ so the palette lives in the same visual family as
// the rest of the sheet. Growing the enum is a data-migration event:
// icon slugs are on-disk strings inside every user's localStorage.
// =============================================================================

/** Bounded rectangle for the hex grid overlay. 20×15 = 300 cells — same as
 *  the paint-only Tier 1 iteration. Fits at readable hex size on a laptop
 *  and gives a regional Ironlands map room to breathe. */
export const MAP_COLS = 20;
export const MAP_ROWS = 15;

/** Pointy-top hex radius in SVG user units (centre to corner). Combined
 *  with MAP_COLS/ROWS this gives the map its 16:10-ish canvas aspect
 *  before the background image is fitted. */
export const HEX_SIZE = 22;

/** Marker icon vocabulary — one slug per pin type. Each maps to an SVG file
 *  under $icons/ (loaded via ?raw imports in MapDialog). Ordered by
 *  frequency-of-use so the picker's first row is the common cases. */
export const MARKER_ICONS = [
	'settlement',
	'hamlet',
	'ruin',
	'encounter',
	'danger',
	'quest',
	'poi',
	'marker',
] as const;
export type MarkerIcon = (typeof MARKER_ICONS)[number];

/** Human-readable labels for the icon picker + a11y. */
export const MARKER_ICON_LABELS: Record<MarkerIcon, string> = {
	settlement: 'Settlement',
	hamlet: 'Hamlet',
	ruin: 'Ruin',
	encounter: 'Encounter',
	danger: 'Danger',
	quest: 'Quest',
	poi: 'Point of Interest',
	marker: 'Marker',
};

/** Downscale target for uploaded background images. Anything larger on its
 *  longest side is resized before we base64-encode into localStorage.
 *  2000px is high enough for a full-screen hex map on a 4K display and
 *  low enough to keep the JPEG under 500 KB at 0.85 quality. */
export const MAP_IMAGE_MAX_DIMENSION = 2000;

/** JPEG quality for the downscaled image. Ironsworn maps tend to be
 *  drawn line-art or watercolour — 0.85 is virtually lossless for those. */
export const MAP_IMAGE_QUALITY = 0.85;

/** Safety cap on the pre-downscale upload — reject anything larger than
 *  20 MB before we even try to decode it. 4K photos rarely exceed this. */
export const MAP_IMAGE_MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** Post-downscale cap on the stored data URL. Chrome's localStorage quota
 *  is ~5 MB across all keys; we reserve half for the map + a generous
 *  budget for other Iron Ledger state. */
export const MAP_IMAGE_MAX_STORED_BYTES = 2 * 1024 * 1024;
