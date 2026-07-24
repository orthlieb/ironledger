// =============================================================================
// Iron Ledger — Campaign map constants
//
// Annotate an uploaded map image on a square grid overlay. Users can have
// many maps (background image + marker list per map) stored server-side.
// The background image IS the terrain — no painting. Markers are grid-pinned
// annotations (label + icon + color + optional entity link) stored as
// fractional (x, y) world coordinates so they can sit at any sub-cell
// intersection revealed by zoom.
//
// Grid model:
//   - Base grid at 100% zoom is `cols × rows` cells (derived from the map's
//     aspect via gridDimsForAspect).
//   - Each cell is 1 × 1 world unit. Marker positions are floats in
//     [0, cols] × [0, rows].
//   - Zoom introduces sub-grid octaves: at 200% each cell splits 2×2
//     (0.5 × 0.5), at 400% it's 4×4 (0.25 × 0.25). Marker placement snaps
//     to the deepest visible intersection at the current zoom.
//
// Icons come from apps/web/static/map/<category>/<slug>.svg, indexed at
// build time into src/lib/generated/mapIconManifest.ts (see the Vite
// plugin in vite.config.ts). Marker.icon stores the composite manifest
// key "<category>/<slug>". Old bare-slug values still resolve via the
// fallback in resolveMapIcon().
// =============================================================================

import { MAP_ICONS, MAP_ICON_LIST, type MapIcon } from './generated/mapIconManifest.js';

/** Default aspect ratio (width / height) for a newly-created map with no
 *  background image yet — 16:9. Once a background is uploaded, the map's
 *  actual aspect is measured from the image and stored in
 *  `settings.aspect`, so every map can adapt to whatever image the user
 *  drops in (portrait, square, ultrawide, whatever). */
export const DEFAULT_MAP_ASPECT = 16 / 9;

/** Target total cell count at 100% zoom. Grid cols × rows are derived
 *  from the map's aspect so different-shape maps stay roughly the same
 *  annotation granularity: a wide map is short-and-many-cols, a tall
 *  map is many-rows-and-few-cols, both around ~200 cells total. */
export const TARGET_CELL_COUNT = 200;

/** Derive (cols, rows) for a given aspect ratio, targeting
 *  ~`TARGET_CELL_COUNT` cells total at 100% zoom. Square cells means
 *  `cols/rows = aspect` directly (no √3/1.5 factor).
 *
 *  Both dims are floor-clamped so extreme aspects (a very narrow
 *  portrait strip, say) don't collapse to a 1×N ribbon. */
export function gridDimsForAspect(aspect: number): { cols: number; rows: number } {
	const rows = Math.max(6, Math.round(Math.sqrt(TARGET_CELL_COUNT / aspect)));
	const cols = Math.max(6, Math.round(rows * aspect));
	return { cols, rows };
}

/** Sub-grid octave for a given zoom. Zoom 1 = octave 0 (base grid).
 *  Zoom 2 = octave 1 (each cell splits 2×2). Zoom 4 = octave 2 (4×4).
 *  Between doublings we hold the previous octave. */
export function subGridOctaveForZoom(zoom: number): number {
	if (!Number.isFinite(zoom) || zoom <= 1) return 0;
	return Math.floor(Math.log2(zoom));
}

/** Snap resolution in world units at a given zoom. 1 at zoom 1, 0.5 at
 *  zoom 2, 0.25 at zoom 4, etc. Marker placement snaps `(x, y)` to the
 *  nearest multiple of this. */
export function snapResolutionForZoom(zoom: number): number {
	return 1 / Math.pow(2, subGridOctaveForZoom(zoom));
}

/** Default icon assigned to a newly-placed marker. A solid dot inside a
 *  ring — the map-annotation convention for "a spot" that reads at any
 *  size. Falls back to any available manifest entry so tests + first-run
 *  don't crash if the preferred slug is missing. */
export const DEFAULT_MARKER_ICON: string =
	MAP_ICONS['position/circle-dot-solid']?.slug != null
		? 'position/circle-dot-solid'
		: MAP_ICONS['travel/marker']?.slug != null
			? 'travel/marker'
			: MAP_ICON_LIST[0]?.category != null
				? `${MAP_ICON_LIST[0].category}/${MAP_ICON_LIST[0].slug}`
				: 'misc/marker';

/** Default marker color — black. Reads on any lightly-tinted terrain
 *  (parchment, watercolor, greens/blues) and matches the ink of most
 *  hand-drawn map labels. Users override per-marker. */
export const DEFAULT_MARKER_COLOR = '#000000';

/** Preset color swatches surfaced next to the native picker. Thirteen
 *  hues chosen for map-annotation legibility:
 *
 *  - Black leads the row because it's the default (and readable on any
 *    lightly-tinted terrain).
 *  - The middle nine are the Tailwind `-500` shades of amber, red,
 *    orange, gold, green, teal, blue, purple, pink — evenly spread
 *    around the wheel, engineered by Tailwind for AA-contrast against
 *    both light and dark surfaces, and vivid enough to read over a
 *    busy watercolor background.
 *  - White + slate + ink cover the neutral end: white for dark maps,
 *    slate for a muted secondary, ink as a softer alternative to pure
 *    black on light parchment. */
export const MARKER_COLOR_PRESETS: string[] = [
	'#000000', // black (default)
	'#ef4444', // red
	'#f97316', // orange
	'#eab308', // gold
	'#f4b93b', // amber
	'#22c55e', // green
	'#14b8a6', // teal
	'#3b82f6', // blue
	'#a855f7', // purple
	'#ec4899', // pink
	'#ffffff', // white
	'#94a3b8', // slate
	'#111827', // ink
];

/**
 * Resolve a Marker.icon reference against the build-time manifest. Accepts
 * the canonical `<category>/<slug>` form and, as a fallback for legacy data,
 * a bare slug (returns the first manifest entry that matches). Returns
 * `undefined` when nothing matches — callers substitute a default glyph.
 */
export function resolveMapIcon(ref: string | undefined | null): MapIcon | undefined {
	if (!ref) return undefined;
	const hit = MAP_ICONS[ref];
	if (hit) return hit;
	return MAP_ICON_LIST.find((i) => i.slug === ref);
}

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
