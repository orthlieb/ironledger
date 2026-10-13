// =============================================================================
// Settlement kit — recipe → layered SVG
//
// The one entry point that turns a marker's settlement RECIPE (tier, culture
// reference, walls, harbour, ruin, seed) plus the culture DEFINITION (an
// extension's cultures/<key>.json) into a layered SVG document. Shared by the
// in-app worker (src/lib/settlementWorker.ts), the icon bake
// (scripts/build-settlement-icons.mjs) and the tests, so all three draw the
// same thing. Deterministic: the same recipe + culture always gives the same
// bytes.
//
// Layered SVG shape: one <path data-role="…"> per colour role (sil, wall,
// wall-shade, wood, …, ink) carrying a real fill so the file also views on its
// own, plus the palette on the root as data-palette="wall:#…;roof:#…". The app
// recolours by role at render time (src/lib/mapLayered.ts). A culture with
// Texture off adds data-texture="off": its walls draw flat, there too.
// =============================================================================

import { building, placedBox, settlement, TEMPLATES } from './layouts3d.js';
import { PARCHMENT, mix, roleColours } from './palette.js';
import { DEFAULT_DESIGN, upgradeDesign } from './pieces3d.js';
import { PATTERN_ROLES, flatWall, lineColour, paletteTone, patternDefs } from './patterns.js';
import { LAYERS, place, renderLayered } from './render.js';

export { fallbackIcon } from './fallback.js';
export { PARCHMENT };

/** @typedef {import('./pieces3d.js').Design} Design */
/** @typedef {import('./pieces3d.js').Placed} Placed */
/** @typedef {import('./layouts3d.js').Tier} Tier */
/** @typedef {import('./layouts3d.js').Walls} Walls */
/** @typedef {import('./palette.js').Palette} Palette */
/**
 * A culture as an extension ships it (extensions/<id>/cultures/<key>.json);
 * `source` is added by the catalogue.
 * @typedef {{key: string, name: string, note?: string, design: Partial<Design>,
 *   palette: Palette, source?: string}} Culture
 */
/**
 * What a marker stores: a REFERENCE to a culture, never the culture itself.
 * `building` (a key of layouts3d.js BUILDINGS) draws that one building
 * instead of a settlement — the Buildings tab: `walls` then encloses it
 * (never a wall building), `stilts` sets it on a deck, and `tier` and
 * `harbor` don't apply.
 * `walls`, `wallShape` and `ground` are the recipe's alone — a culture has no
 * say in them (its wall *style* — height, merlons, towers, gate — it has).
 * @typedef {{tier: Tier, culture: string, seed: number, walls?: Walls,
 *   wallShape?: 'round' | 'square', ground?: import('./pieces3d.js').Ground,
 *   stilts?: boolean, harbor?: boolean, building?: string,
 *   ruin?: {decay: number, burned?: boolean}}} SettlementRecipe
 */

/** Geometry at 2× while line weights stay put → finer hatching. */
const K = 2;
const OUTLINE = 1.4;

/**
 * Render placed pieces to a layered SVG document.
 * @param {string} title
 * @param {Placed[]} items
 * @param {Palette} palette
 * @param {{join?: Design['join'], texture?: boolean, hatching?: boolean,
 *   frame?: {x0: number, x1: number, y0: number, y1: number} | null}} [o]
 *   line joins (default: the default culture's); `texture: false` draws no
 *   textures — no line-work texture layers, and every wall in its flat
 *   material colour; `hatching` hatches the shaded faces (off — IronLedger's
 *   look, every map icon's — shades them by colour alone); `frame` takes in
 *   that box too (placed units, y up — placedBox()): a ruin framed as its
 *   building was
 * @returns {string}
 */
export function toLayeredSvg(title, items, palette, o = {}) {
	const texture = o.texture ?? true;
	const parts = items.flatMap((it) =>
		place(it.piece, { ...it, x: (it.x ?? 0) * K, y: (it.y ?? 0) * K, s: (it.s ?? 1) * K }),
	);
	const {
		layers,
		silhouette,
		bounds: b,
	} = renderLayered(parts, {
		outline: OUTLINE,
		join: o.join ?? DEFAULT_DESIGN.join,
		texture,
		hatching: o.hatching ?? false,
	});
	const f = roleColours(palette);
	const pad = 2;
	let { x, y, w, h } = b;
	// Taking in the frame too — outlined, as b is, and flipped to SVG's y
	// down — so a marker shows it at that scale and standing there, not
	// zoomed to fill.
	if (o.frame) {
		const e = OUTLINE / 2,
			x0 = Math.min(x, o.frame.x0 * K - e),
			y0 = Math.min(y, -o.frame.y1 * K - e);
		w = Math.max(x + w, o.frame.x1 * K + e) - x0;
		h = Math.max(y + h, -o.frame.y0 * K + e) - y0;
		x = x0;
		y = y0;
	}
	const vb = [x - pad, y - pad, w + 2 * pad, h + 2 * pad]
		.map((n) => Number(n.toFixed(2)))
		.join(' ');
	const pal = Object.entries(palette)
		.map(([k, v]) => `${k}:${v}`)
		.join(';');
	// Patterns are id-scoped per icon with a tiny hash of the title so two
	// icons rendered into the same document (the playground, a settlement
	// gallery page) don't collide on `#pat-wall-stone`.
	const scope = patternScope(title);
	const used = LAYERS.filter((l) => layers[l]);
	const { defs, url } = patternDefs(
		texture ? used.filter((l) => PATTERN_ROLES.has(l)) : [],
		(role) => paletteTone(role, palette.ink, mix),
		scope,
	);
	/** @param {string} l */
	const wallFill = (l) => (texture ? url(l) : flatWall(l, palette.ink, mix));
	const paths = [
		`  <path data-role="sil" fill="${palette.halo}" stroke="${palette.halo}" stroke-width="3" stroke-linejoin="round" d="${silhouette}"/>`,
		...used.map(
			(l) =>
				`  <path data-role="${l}" fill="${l.endsWith('-line') ? lineColour(l, f, mix) : PATTERN_ROLES.has(l) ? wallFill(l) : f[l]}" d="${layers[l]}"/>`,
		),
	];
	const safeTitle = title.replace(/[<>&"-]/g, ' ');
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" data-palette="${pal}"${texture ? '' : ' data-texture="off"'}><!--"${safeTitle}" — Iron Ledger settlement kit-->\n` +
		(defs ? `  ${defs}\n` : '') +
		paths.join('\n') +
		'\n</svg>\n'
	);
}

/** Short deterministic id suffix for an icon's title, URL-safe.
 *  @param {string} title */
function patternScope(title) {
	let h = 2166136261;
	for (let i = 0; i < title.length; i++) {
		h ^= title.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return (h >>> 0).toString(36);
}

/**
 * The Design a recipe draws with: the culture's (or the default's) design,
 * with the recipe's own overrides on top.
 * @param {SettlementRecipe} recipe
 * @param {Culture | null | undefined} culture
 * @returns {Design}
 */
export function recipeDesign(recipe, culture) {
	return {
		...DEFAULT_DESIGN,
		...upgradeDesign(culture?.design ?? {}),
	};
}

/**
 * Turn a recipe into a layered SVG. A missing culture (its extension is off
 * or gone, or the key changed) draws with the default culture.
 * @param {SettlementRecipe} recipe
 * @param {Culture | null | undefined} culture
 * @returns {string}
 */
export function generateSettlementSvg(recipe, culture) {
	const tier = recipe.tier in TEMPLATES ? recipe.tier : 'village';
	const design = recipeDesign(recipe, culture);
	const ruin = recipe.ruin
		? {
				decay: recipe.ruin.decay,
				overgrowth: 0.4,
				burned: !!recipe.ruin.burned,
				seed: recipe.seed,
			}
		: null;
	/** @param {typeof ruin} r the ruin, or none for the whole thing */
	const draw = (r) =>
		recipe.building
			? building(recipe.building, design, {
					walls: recipe.walls,
					wallShape: recipe.wallShape,
					seed: recipe.seed,
					ground: recipe.ground,
					stilts: !!recipe.stilts,
					ruin: r,
				})
			: settlement(tier, design, {
					walls: recipe.walls ?? 'none',
					wallShape: recipe.wallShape,
					seed: recipe.seed,
					ground: recipe.ground,
					harbor: recipe.harbor ? 'side' : 'none',
					stilts: !!recipe.stilts,
					ruin: r,
				});
	const items = draw(ruin);
	// A ruin is framed as the building or settlement was, so what's left
	// doesn't swell to fill the marker (its ink thickening) as it comes down,
	// but stands where it stood, at its scale.
	const frame = ruin ? placedBox(draw(null)) : null;
	return toLayeredSvg(
		`${culture?.name ?? 'Default'} ${recipe.building ?? tier}`,
		items,
		culture?.palette ?? PARCHMENT,
		{
			join: design.join,
			texture: design.texture,
			frame,
		},
	);
}
