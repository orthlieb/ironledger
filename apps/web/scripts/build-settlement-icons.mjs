// =============================================================================
// Iron Ledger — bake the settlement-kit map icons
//
// Renders layered (multi-colour) SVGs from the 3D settlement kit in
// src/lib/settlement-kit/ (the same generator the app's Settlement builder
// and tools/settlement-playground.html use) and writes the core icons to
// apps/web/static/map/settlement/: buildings, settlements and ruins in the
// default culture and Parchment palette. Each replaces any old hand-drawn
// icon of the same slug; RETIRED lists the old icons the kit drops outright.
//
// Culture-styled settlements aren't baked — every culture plugin is one pick
// away in the Settlement builder, which generates them on the fly.
//
// Layered SVG shape: one <path data-role="…"> per colour role (sil, wall,
// wall-shade, wood, …, ink) carrying a real fill so the file also views on
// its own, and the palette on the root as data-palette="wall:#…;roof:#…".
// The app recolours by role at render time (src/lib/mapLayered.ts) and puts
// the marker colour on the roofs.
//
// Output is checked in. Re-run after editing the kit:
//   npm run build:settlement-icons -w apps/web
// =============================================================================

import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PARCHMENT, toLayeredSvg } from '../src/lib/settlement-kit/generate.js';
import { pieces, settlement } from '../src/lib/settlement-kit/layouts3d.js';
import { DEFAULT_DESIGN, keep, roundHut, tent } from '../src/lib/settlement-kit/pieces3d.js';
import { ruinPlaced } from '../src/lib/settlement-kit/ruins3d.js';
import { loadCultures } from './settlement-kit/loadCultures.mjs';

/** @typedef {import('../src/lib/settlement-kit/pieces3d.js').Design} Design */
/** @typedef {import('../src/lib/settlement-kit/pieces3d.js').Placed} Placed */

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = dirname(HERE);
const CORE = join(WEB, 'static', 'map');

const D = DEFAULT_DESIGN;
const elves = loadCultures().find((c) => c.key === 'elves');
if (!elves) throw new Error('no elves culture');
/** @type {Design} */
const ELVES = { ...D, ...elves.design };
/** @param {Design} d @param {string} name */
const piece = (d, name) => {
	const hit = pieces(d).find(([t]) => t === name);
	if (!hit) throw new Error(`no piece "${name}"`);
	return hit[1];
};
const RUIN = { decay: 0.5, overgrowth: 0.4, burned: false, seed: 3 };
/** @param {Placed[]} items */
const ruined = (items) => ruinPlaced(items, RUIN);

/**
 * Core icons the kit now covers, keyed by the OLD slug they replace.
 * @type {Record<string, [string, () => Placed[]]>} slug → [category, recipe]
 */
const CORE_ICONS = {
	// Single buildings.
	house: ['settlement', () => piece(D, 'Gable house')],
	'family-house': ['settlement', () => piece({ ...D, storeys: 1 }, 'Gable house')],
	townhouse: ['settlement', () => piece(D, 'Townhouse')],
	cabin: ['settlement', () => piece({ ...D, pitch: 0.6 }, 'Side house')],
	hut: ['settlement', () => [{ piece: roundHut(D) }]],
	barn: ['settlement', () => piece(D, 'Barn')],
	warehouse: ['settlement', () => piece(D, 'Warehouse')],
	factory: ['settlement', () => piece(D, 'Workshop')],
	tavern: ['settlement', () => piece(D, 'Tavern')],
	'medieval-barracks': ['settlement', () => piece(D, 'Barracks')],
	church: ['settlement', () => piece(D, 'Church')],
	'viking-longhouse': ['settlement', () => piece(D, 'Longhouse')],
	keep: ['settlement', () => piece(D, 'Keep')],
	'block-house': ['settlement', () => [{ piece: keep({ ...D, flags: false }, { w: 16, h: 20 }) }]],
	'fortified-tower': ['settlement', () => piece({ ...D, towerRoof: 'none' }, 'Round tower')],
	'domed-tower': ['settlement', () => piece({ ...D, towerRoof: 'dome' }, 'Round tower')],
	'domed-house': [
		'settlement',
		() => piece({ ...D, towerRoof: 'dome', storeys: 1 }, 'Gable house'),
	],
	watchtower: ['settlement', () => piece({ ...D, towerRoof: 'none', stature: 1.2 }, 'Round tower')],
	'guarded-tower': [
		'settlement',
		() => piece({ ...D, towerRoof: 'none', masonry: true, stature: 1.15 }, 'Round tower'),
	],
	'stone-tower': [
		'settlement',
		() => piece({ ...D, towerRoof: 'none', masonry: true }, 'Round tower'),
	],
	'small-tower': ['settlement', () => piece({ ...D, stature: 0.75, flags: false }, 'Round tower')],
	'tower-flag': ['settlement', () => piece(D, 'Round tower')],
	'white-tower': ['settlement', () => piece({ ...D, flags: false }, 'Round tower')],
	windmill: ['settlement', () => piece(D, 'Windmill')],
	mill: ['settlement', () => piece(D, 'Water mill')],
	'water-mill': ['settlement', () => piece(D, 'Water mill')],
	mine: ['settlement', () => piece(D, 'Mine')],
	'gold-mine': ['settlement', () => piece(D, 'Mine')],
	lighthouse: ['settlement', () => piece(D, 'Lighthouse')],
	well: ['settlement', () => piece(D, 'Well')],
	cathedral: ['settlement', () => piece(D, 'Cathedral')],
	clocktower: ['settlement', () => piece(D, 'Clock tower')],
	'witches-hut': ['settlement', () => piece(D, 'Witch hut')],
	'camping-tent': ['settlement', () => piece(D, 'Tent')],
	// Scaled like the standalone pieces so its lines match (see MIN_PIECE_SIZE).
	'barracks-tent': ['settlement', () => [{ piece: tent(D, { w: 22 }), s: 1.15 }]],
	'medieval-pavilion': ['settlement', () => piece(D, 'Pavilion')],
	'medieval-gate': ['settlement', () => piece(D, 'Gatehouse')],
	'wooden-gate': ['settlement', () => piece(D, 'Wooden gate')],
	'stone-wall': ['settlement', () => piece(D, 'Wall')],
	'defensive-wall': ['settlement', () => piece(D, 'Wall tower')],
	palisade: ['settlement', () => piece(D, 'Palisade')],
	'harbor-dock': ['settlement', () => piece(D, 'Dock')],
	'wooden-pier': ['settlement', () => piece(D, 'Pier')],
	// The Elves' castle, in the default palette: concave towers and walls.
	'elven-castle': ['settlement', () => settlement('hold', ELVES, { walls: 'stone' })],
	camp: ['settlement', () => settlement('camp', D)],
	'forest-camp': ['settlement', () => settlement('camp', { ...D, houseForm: 'round' })],
	'desert-camp': ['settlement', () => settlement('camp', { ...D, houseForm: 'round', pitch: 0.6 })],
	// Fortifications.
	castle: ['settlement', () => settlement('hold', D, { walls: 'stone' })],
	fortress: [
		'settlement',
		() => settlement('hold', { ...D, wallShape: 'square' }, { walls: 'stone' }),
	],
	'locked-fortress': [
		'settlement',
		() => settlement('hold', { ...D, wallShape: 'square', gate: 'twin' }, { walls: 'stone' }),
	],
	'military-fort': ['settlement', () => settlement('outpost', { ...D, wallShape: 'square' })],
	'hill-fort': ['settlement', () => settlement('hold', D, { walls: 'earth' })],
	// Settlements, by size and wall.
	village: ['settlement', () => settlement('village', D)],
	'village-wood-wall': ['settlement', () => settlement('village', D, { walls: 'palisade' })],
	'village-stone-wall': ['settlement', () => settlement('village', D, { walls: 'stone' })],
	'medieval-village-01': ['settlement', () => settlement('village', D, { seed: 2 })],
	'huts-village': ['settlement', () => settlement('village', { ...D, houseForm: 'round' })],
	town: ['settlement', () => settlement('town', D, { walls: 'none' })],
	'town-wood-wall': ['settlement', () => settlement('town', D, { walls: 'palisade' })],
	'town-stone-wall': ['settlement', () => settlement('town', D, { walls: 'stone' })],
	'small-city': ['settlement', () => settlement('city', D, { walls: 'none' })],
	'small-city-stone-wall': [
		'settlement',
		() => settlement('city', { ...D, wallTowers: 0 }, { walls: 'stone' }),
	],
	'small-city-stone-wall-towers': ['settlement', () => settlement('city', D, { walls: 'stone' })],
	'large-city': ['settlement', () => settlement('capital', D, { walls: 'none' })],
	'large-city-stone-wall': [
		'settlement',
		() => settlement('capital', { ...D, wallTowers: 0 }, { walls: 'stone' }),
	],
	'large-city-stone-wall-towers': [
		'settlement',
		() => settlement('capital', D, { walls: 'stone' }),
	],
	// Ruins.
	'castle-ruin': ['settlement', () => ruined(settlement('hold', D, { walls: 'stone' }))],
	'cathedral-ruin': ['settlement', () => ruined(piece(D, 'Cathedral'))],
	'fortified-tower-ruin': [
		'settlement',
		() => ruined(piece({ ...D, towerRoof: 'none' }, 'Round tower')),
	],
	'tavern-ruin': ['settlement', () => ruined(piece(D, 'Tavern'))],
	'mine-ruin': ['settlement', () => ruined(piece(D, 'Mine'))],
	'town-ruin': ['settlement', () => ruined(settlement('town', D, { walls: 'stone' }))],
	'village-ruin': ['settlement', () => ruined(settlement('village', D))],
	'village-stone-wall-ruin': [
		'settlement',
		() => ruined(settlement('village', D, { walls: 'stone' })),
	],
	'fortress-ruin': [
		'settlement',
		() => ruined(settlement('hold', { ...D, wallShape: 'square' }, { walls: 'stone' })),
	],
	'house-ruin': ['settlement', () => ruinPlaced(piece(D, 'Gable house'), { ...RUIN, decay: 0.2 })],
	'broken-wall': ['settlement', () => ruined(piece(D, 'Wall'))],
};

/** Delete any existing icon (svg or png) for a slug in a category folder. */
function retire(/** @type {string} */ dir, /** @type {string} */ slug) {
	for (const ext of ['svg', 'png']) {
		const p = join(dir, `${slug}.${ext}`);
		if (existsSync(p)) rmSync(p);
	}
}

/**
 * Old hand-drawn building icons the kit retires without a same-slug
 * replacement (cultures and the pieces above cover them), plus the two
 * site icons that moved into Settlement. Deleted on every bake.
 */
const RETIRED = [
	'settlement/dark-tower',
	'settlement/evil-tower',
	'settlement/strange-castle',
	'settlement/monster-town',
	'settlement/monster-village',
	'settlement/dwarven-building',
	'settlement/dwarven-building-ruin',
	'settlement/indian-palace',
	'settlement/viking-church',
	'settlement/goblin-camp',
	'settlement/orc-camp',
	'settlement/drawbridge',
	'settlement/small-stone-wall',
	'settlement/large-stone-wall',
	'settlement/wooden-wall',
	'site/castle-ruins',
	'site/damaged-house',
];

const t0 = Date.now();
for (const key of RETIRED) {
	const [cat, slug] = key.split('/');
	retire(join(CORE, cat), slug);
}
let n = 0;
for (const [slug, [cat, recipe]] of Object.entries(CORE_ICONS)) {
	const dir = join(CORE, cat);
	retire(dir, slug);
	writeFileSync(join(dir, `${slug}.svg`), toLayeredSvg(slug, recipe(), PARCHMENT));
	n++;
}
console.log(
	`settlement kit: ${n} core icons → static/map/settlement (${((Date.now() - t0) / 1000).toFixed(0)}s)`,
);
