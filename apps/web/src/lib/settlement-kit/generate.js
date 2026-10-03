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
// recolours by role at render time (src/lib/mapLayered.ts).
// =============================================================================

import { settlement, TEMPLATES } from './layouts3d.js';
import { DEFAULT_DESIGN } from './pieces3d.js';
import { LAYERS, place, renderLayered } from './render.js';

export { fallbackIcon } from './fallback.js';

/** @typedef {import('./pieces3d.js').Design} Design */
/** @typedef {import('./pieces3d.js').Placed} Placed */
/** @typedef {import('./layouts3d.js').Tier} Tier */
/** @typedef {import('./layouts3d.js').Walls} Walls */
/**
 * @typedef {{wall: string, roof: string, wood: string, earth: string,
 *   water: string, ink: string, flag: string, halo: string}} Palette
 */
/**
 * A culture as an extension ships it (extensions/<id>/cultures/<key>.json);
 * `source` is added by the catalogue.
 * @typedef {{key: string, name: string, note?: string, design: Partial<Design>,
 *   palette: Palette, source?: string}} Culture
 */
/**
 * What a marker stores: a REFERENCE to a culture, never the culture itself.
 * @typedef {{tier: Tier, culture: string, seed: number, walls?: Walls,
 *   wallShape?: 'round' | 'square', harbor?: boolean,
 *   ruin?: {decay: number, burned?: boolean}}} SettlementRecipe
 */

/** Geometry at 2× while line weights stay put → finer hatching. */
const K = 2;
const OUTLINE = 1.4;

/** Parchment — the default culture's palette. @type {Palette} */
export const PARCHMENT = {
	wall: '#EFEADF',
	roof: '#D9776B',
	wood: '#C9A97C',
	earth: '#94744F',
	water: '#8FB0B8',
	flag: '#4A3B32',
	ink: '#3B2F28',
	halo: '#F4EFE4',
};

/** @param {string} a @param {string} b @param {number} t `t` of a, the rest b */
function mix(a, b, t) {
	const ch = (/** @type {string} */ h, /** @type {number} */ i) =>
		parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
	return (
		'#' +
		[0, 1, 2]
			.map((i) =>
				Math.round(ch(a, i) * t + ch(b, i) * (1 - t))
					.toString(16)
					.padStart(2, '0'),
			)
			.join('')
	);
}

/** Fill per role (mirrors src/lib/mapLayered.ts roleColours). @param {Palette} p */
function fills(p) {
	/** @type {Record<string, string>} */
	const f = {
		wall: p.wall,
		roof: p.roof,
		wood: p.wood,
		earth: p.earth,
		water: p.water,
		flag: p.flag,
		ink: p.ink,
	};
	f['wall-shade'] = mix(p.wall, p.ink, 0.8);
	f['wood-shade'] = mix(p.wood, p.ink, 0.75);
	f['earth-shade'] = mix(p.earth, p.ink, 0.75);
	f['water-shade'] = mix(p.water, p.ink, 0.8);
	f['roof-shade'] = mix(p.roof, p.ink, 0.7);
	return f;
}

/**
 * Render placed pieces to a layered SVG document.
 * @param {string} title
 * @param {Placed[]} items
 * @param {Palette} palette
 * @param {{join?: Design['join']}} [o] line joins (default: the default culture's)
 * @returns {string}
 */
export function toLayeredSvg(title, items, palette, o = {}) {
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
	});
	const f = fills(palette);
	const pad = 2;
	const vb = [b.x - pad, b.y - pad, b.w + 2 * pad, b.h + 2 * pad]
		.map((n) => Number(n.toFixed(2)))
		.join(' ');
	const pal = Object.entries(palette)
		.map(([k, v]) => `${k}:${v}`)
		.join(';');
	const paths = [
		`  <path data-role="sil" fill="${palette.halo}" stroke="${palette.halo}" stroke-width="3" stroke-linejoin="round" d="${silhouette}"/>`,
		...LAYERS.filter((l) => layers[l]).map(
			(l) => `  <path data-role="${l}" fill="${f[l]}" d="${layers[l]}"/>`,
		),
	];
	const safeTitle = title.replace(/[<>&"-]/g, ' ');
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" data-palette="${pal}"><!--"${safeTitle}" — Iron Ledger settlement kit-->\n` +
		paths.join('\n') +
		'\n</svg>\n'
	);
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
		...(culture?.design ?? {}),
		...(recipe.wallShape ? { wallShape: recipe.wallShape } : {}),
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
	const items = settlement(tier, design, {
		walls: recipe.walls ?? 'auto',
		seed: recipe.seed,
		harbor: recipe.harbor ? 'side' : 'none',
		ruin: recipe.ruin
			? {
					decay: recipe.ruin.decay,
					overgrowth: 0.4,
					burned: !!recipe.ruin.burned,
					seed: recipe.seed,
				}
			: null,
	});
	return toLayeredSvg(
		`${culture?.name ?? 'Default'} ${tier}`,
		items,
		culture?.palette ?? PARCHMENT,
		{
			join: design.join,
		},
	);
}
