// =============================================================================
// Iron Ledger — Campaign map constants
//
// One map per user, painted onto a bounded pointy-top hex grid stored in
// localStorage. Terrain enum is intentionally tight — 10 tiles cover every
// Ironsworn region (Havens through Shattered Wastes) plus a fog cell for
// "we know a hex is here but haven't identified it." Overlays (river, road,
// settlement, ruin) belong in the marker layer, not this fill palette;
// splitting them out avoids the "does a river hex mean the whole hex is
// river" ambiguity that adds a tile pays for.
//
// Growing the enum is a data-migration event — every user's localStorage
// carries terrain names as strings. Adding a new value is safe; renaming or
// removing one breaks existing maps.
// =============================================================================

/** Canonical terrain slugs, in palette display order. Order matches the
 *  Ironsworn region cardinality (settled → wild → extreme → water → fog). */
export const TERRAINS = [
	'plains',
	'forest',
	'hills',
	'mountains',
	'marsh',
	'wastes',
	'snow',
	'coast',
	'sea',
	'unknown',
] as const;
export type Terrain = (typeof TERRAINS)[number];

/** Fill colours for each terrain. Chosen for legibility against both light
 *  and dark themes and to be distinguishable at ~22px hex radius. */
export const TERRAIN_COLORS: Record<Terrain, string> = {
	plains: '#a3c66a',
	forest: '#3f7d3f',
	hills: '#8a9f5a',
	mountains: '#6b5d54',
	marsh: '#5a8878',
	wastes: '#c0a878',
	snow: '#d5e1eb',
	coast: '#e8d69a',
	sea: '#4a8fbf',
	unknown: '#8a8580',
};

/** Human-readable labels for tooltips + a11y. Not shown on the hex itself. */
export const TERRAIN_LABELS: Record<Terrain, string> = {
	plains: 'Plains',
	forest: 'Forest',
	hills: 'Hills',
	mountains: 'Mountains',
	marsh: 'Marsh',
	wastes: 'Wastes',
	snow: 'Snow / Ice',
	coast: 'Coast',
	sea: 'Sea',
	unknown: 'Unknown',
};

/** Bounded rectangle — 20 columns × 15 rows = ~300 hexes actually rendered
 *  (fewer after offset-row shift trims edges). Big enough for a regional
 *  Ironlands map, small enough to fit at readable hex size on a laptop. */
export const MAP_COLS = 20;
export const MAP_ROWS = 15;

/** Pointy-top hex radius in SVG user units (centre to corner). Chosen to
 *  give the full grid an aspect ratio close to 16:10 in the viewport. */
export const HEX_SIZE = 22;
