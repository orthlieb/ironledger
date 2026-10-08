// =============================================================================
// Settlement kit — browser playground (PROTOTYPE)
//
// Bundled into a self-contained page by build-playground.mjs. Every Design
// knob, the wall/outline drawing options and every colour role get a
// control; icons regenerate in the page on each change. The culture presets
// are the culture plugins (cultures/*.json), baked in at build time; Export
// culture downloads the current knobs + colours as a new plugin file.
// =============================================================================

import { DEFAULT_DESIGN, makeDesign } from '../../src/lib/settlement-kit/pieces3d.js';
import { TEMPLATES, pieces, settlement } from '../../src/lib/settlement-kit/layouts3d.js';
import { LAYERS, place, renderLayered } from '../../src/lib/settlement-kit/render.js';
import { ruinPlaced } from '../../src/lib/settlement-kit/ruins3d.js';

/** @typedef {import('../../src/lib/settlement-kit/pieces3d.js').Design} Design */
/** @typedef {import('../../src/lib/settlement-kit/pieces3d.js').Placed} Placed */
/** @typedef {import('../../src/lib/settlement-kit/generate.js').Culture} Culture */

/** Culture plugins by display name, injected by build-playground.mjs. */
const CULTURES = /** @type {Record<string, Culture>} */ (
	Object.fromEntries(
		/** @type {Culture[]} */ (/** @type {any} */ (globalThis).__SETTLEMENT_CULTURES__ ?? []).map(
			(c) => [c.source && c.source !== 'base' ? `${c.name} (${c.source})` : c.name, c],
		),
	)
);

const K = 2; // geometry at 2× while line weights stay put → finer hatching

/**
 * @typedef {{key: string, label: string, group: string,
 *   type: 'range' | 'select' | 'check', min?: number, max?: number, step?: number,
 *   options?: string[], design?: boolean}} Knob
 */

/** @type {Knob[]} */
const KNOBS = [
	{
		group: 'Build',
		key: 'houseForm',
		label: 'House form',
		type: 'select',
		options: ['timber', 'round', 'mound', 'stilt'],
		design: true,
	},
	{
		group: 'Build',
		key: 'ground',
		label: 'Ground',
		type: 'select',
		options: ['land', 'water'],
		design: true,
	},
	{
		group: 'Build',
		key: 'stature',
		label: 'Stature',
		type: 'range',
		min: 0.6,
		max: 1.5,
		step: 0.01,
		design: true,
	},
	{
		group: 'Build',
		key: 'scale',
		label: 'Scale',
		type: 'range',
		min: 0.7,
		max: 1.8,
		step: 0.01,
		design: true,
	},
	{
		group: 'Build',
		key: 'flourish',
		label: 'Flourish',
		type: 'range',
		min: 0,
		max: 1,
		step: 0.01,
		design: true,
	},
	{ group: 'Build', key: 'masonry', label: 'Masonry', type: 'check', design: true },
	{
		group: 'Houses',
		key: 'longhouse',
		label: 'Longhouse share',
		type: 'range',
		min: 0,
		max: 1,
		step: 0.01,
		design: true,
	},
	{
		group: 'Houses',
		key: 'huts',
		label: 'Hut share',
		type: 'range',
		min: 0,
		max: 1,
		step: 0.01,
		design: true,
	},
	{
		group: 'Houses',
		key: 'pitch',
		label: 'Roof pitch',
		type: 'range',
		min: 0.3,
		max: 1.4,
		step: 0.01,
		design: true,
	},
	{
		group: 'Houses',
		key: 'concave',
		label: 'Roof sweep',
		type: 'range',
		min: 0,
		max: 0.3,
		step: 0.01,
		design: true,
	},
	{
		group: 'Houses',
		key: 'depth',
		label: 'House depth',
		type: 'range',
		min: 0.4,
		max: 1.2,
		step: 0.01,
		design: true,
	},
	{
		group: 'Houses',
		key: 'gable',
		label: 'Gable-front share',
		type: 'range',
		min: 0,
		max: 1,
		step: 0.01,
		design: true,
	},
	{
		group: 'Houses',
		key: 'storeys',
		label: 'Two-storey share',
		type: 'range',
		min: 0,
		max: 1,
		step: 0.01,
		design: true,
	},
	{
		group: 'Houses',
		key: 'window',
		label: 'Windows',
		type: 'select',
		options: ['square', 'arched', 'slit', 'round'],
		design: true,
	},
	{
		group: 'Houses',
		key: 'door',
		label: 'Doors',
		type: 'select',
		options: ['arched', 'square', 'gothic'],
		design: true,
	},
	{ group: 'Houses', key: 'manyDoors', label: 'Many doors', type: 'check', design: true },
	{
		group: 'Houses',
		key: 'industry',
		label: 'Trade buildings',
		type: 'range',
		min: 0,
		max: 1,
		step: 0.01,
		design: true,
	},
	{
		group: 'Towers',
		key: 'towerRoof',
		label: 'Tower top',
		type: 'select',
		options: ['cone', 'onion', 'crenel', 'dome'],
		design: true,
	},
	{
		group: 'Towers',
		key: 'towerCorbel',
		label: 'Corbel',
		type: 'range',
		min: 0,
		max: 1,
		step: 0.05,
		design: true,
	},
	{
		group: 'Towers',
		key: 'spire',
		label: 'Spire height',
		type: 'range',
		min: 1,
		max: 4,
		step: 0.05,
		design: true,
	},
	{
		group: 'Towers',
		key: 'taper',
		label: 'Tower taper',
		type: 'range',
		min: 0,
		max: 0.2,
		step: 0.01,
		design: true,
	},
	{ group: 'Landmarks', key: 'church', label: 'Church', type: 'check', design: true },
	{
		group: 'Landmarks',
		key: 'symbol',
		label: 'Holy symbol',
		type: 'select',
		options: ['none', 'orb', 'sun', 'spike', 'horns', 'wheel', 'claw', 'trident', 'cross'],
		design: true,
	},
	{
		group: 'Landmarks',
		key: 'keep',
		label: 'Castle keep in',
		type: 'select',
		options: ['none', 'city', 'town', 'all'],
		design: true,
	},
	{
		group: 'Landmarks',
		key: 'market',
		label: 'Market square in',
		type: 'select',
		options: ['none', 'town', 'all'],
		design: true,
	},
	{ group: 'Flags', key: 'flags', label: 'Flags', type: 'check', design: true },
	{
		group: 'Flags',
		key: 'flagLen',
		label: 'Flag length',
		type: 'range',
		min: 5,
		max: 20,
		step: 0.5,
		design: true,
	},
	{
		group: 'Flags',
		key: 'flagFolds',
		label: 'Flag folds',
		type: 'range',
		min: 1,
		max: 5,
		step: 1,
		design: true,
	},
	{
		group: 'Flags',
		key: 'flagShape',
		label: 'Flag shape',
		type: 'select',
		options: ['banner', 'pennant', 'swallowtail'],
		design: true,
	},
	{
		group: 'Walls',
		key: 'wall',
		label: 'Culture wall',
		type: 'select',
		options: ['none', 'stone', 'palisade', 'earth', 'hedge', 'bone', 'reef'],
		design: true,
	},
	{
		group: 'Walls',
		key: 'wallShape',
		label: 'Wall shape',
		type: 'select',
		options: ['round', 'square'],
		design: true,
	},
	{
		group: 'Walls',
		key: 'wallH',
		label: 'Wall height',
		type: 'range',
		min: 0.6,
		max: 1.6,
		step: 0.01,
		design: true,
	},
	{ group: 'Walls', key: 'merlons', label: 'Merlons', type: 'check', design: true },
	{
		group: 'Towers',
		key: 'towerBow',
		label: 'Tower bow',
		type: 'range',
		min: -1,
		max: 1,
		step: 0.05,
		design: true,
	},
	{
		group: 'Walls',
		key: 'wallBow',
		label: 'Wall bow',
		type: 'range',
		min: -1,
		max: 1,
		step: 0.05,
		design: true,
	},
	{
		group: 'Walls',
		key: 'wallTowers',
		label: 'Ring towers (city)',
		type: 'range',
		min: 0,
		max: 8,
		step: 1,
		design: true,
	},
	{
		group: 'Walls',
		key: 'gate',
		label: 'Gate',
		type: 'select',
		options: ['tower', 'twin', 'jawbone'],
		design: true,
	},
	{ group: 'Ruin', key: 'ruin', label: 'Ruined', type: 'check' },
	{ group: 'Ruin', key: 'decay', label: 'Decay', type: 'range', min: 0, max: 1, step: 0.01 },
	{
		group: 'Ruin',
		key: 'overgrowth',
		label: 'Overgrowth',
		type: 'range',
		min: 0,
		max: 1,
		step: 0.01,
	},
	{ group: 'Ruin', key: 'burned', label: 'Burned', type: 'check' },
	{
		group: 'Drawing',
		key: 'tiers',
		label: 'Tiers',
		type: 'select',
		options: ['main', 'small', 'large', 'all'],
	},
	{
		group: 'Drawing',
		key: 'harbor',
		label: 'Harbour',
		type: 'select',
		options: ['none', 'side'],
	},
	{
		group: 'Drawing',
		key: 'walls',
		label: 'Walls',
		type: 'select',
		options: ['auto', 'none', 'stone', 'palisade', 'earth', 'hedge', 'bone', 'reef'],
	},
	{ group: 'Drawing', key: 'stilts', label: 'On stilts', type: 'check' },
	{
		group: 'Drawing',
		key: 'join',
		label: 'Joins',
		type: 'select',
		options: ['sharp', 'round', 'soft'],
		design: true,
	},
	{
		group: 'Drawing',
		key: 'softRadius',
		label: 'Soft radius',
		type: 'range',
		min: 0.2,
		max: 2.5,
		step: 0.05,
	},
	{
		group: 'Drawing',
		key: 'outline',
		label: 'Outline',
		type: 'range',
		min: 0.6,
		max: 3,
		step: 0.05,
	},
	{
		group: 'Drawing',
		key: 'hatch',
		label: 'Hatch spacing',
		type: 'range',
		min: 0.9,
		max: 2.6,
		step: 0.05,
		design: true,
	},
	{
		group: 'Drawing',
		key: 'layout',
		label: 'Layout seed',
		type: 'range',
		min: 1,
		max: 50,
		step: 1,
	},
];

/** Which settlement templates to show. */
const TIER_SETS = /** @type {Record<string, (keyof typeof TEMPLATES)[]>} */ ({
	main: ['hamlet', 'village', 'town', 'city'],
	small: ['stead', 'camp', 'outpost', 'hamlet'],
	large: ['hold', 'city', 'capital', 'freeport'],
	all: /** @type {(keyof typeof TEMPLATES)[]} */ (Object.keys(TEMPLATES)),
});

const DRAWING = {
	ruin: false,
	decay: 0.45,
	overgrowth: 0.5,
	burned: false,
	tiers: 'main',
	harbor: 'none',
	walls: 'auto',
	stilts: false,
	softRadius: 0.9,
	outline: 1.4,
	layout: 1,
};

/** @type {Record<string, Record<string, string>>} */
const PALETTES = {
	Parchment: {
		wall: '#EFEADF',
		roof: '#D9776B',
		wood: '#C9A97C',
		earth: '#94744F',
		water: '#8FB0B8',
		ink: '#3B2F28',
		flag: '#4A3B32',
		halo: '#F4EFE4',
	},
	'Ironlands slate': {
		wall: '#E6E3DA',
		roof: '#6F8296',
		wood: '#A89A7E',
		earth: '#7D6A50',
		water: '#8FB0B8',
		ink: '#2C2A28',
		flag: '#8C2F2A',
		halo: '#F4EFE4',
	},
	Autumn: {
		wall: '#F2E6CF',
		roof: '#C8732E',
		wood: '#B88A55',
		earth: '#9A7448',
		water: '#8FB0B8',
		ink: '#3A2A1C',
		flag: '#6B2B1C',
		halo: '#F7EEDC',
	},
	Verdigris: {
		wall: '#EDEBE3',
		roof: '#5E9C8A',
		wood: '#B7A27F',
		earth: '#82705A',
		water: '#8FB0B8',
		ink: '#26302D',
		flag: '#B5452F',
		halo: '#F4F2EA',
	},
	'Ink only': {
		wall: '#FFFFFF',
		roof: '#FFFFFF',
		wood: '#FFFFFF',
		earth: '#FFFFFF',
		water: '#8FB0B8',
		ink: '#222222',
		flag: '#222222',
		halo: '#FFFFFF',
	},
};
const COLOUR_ROLES = [
	['roof', 'Marker (roofs)'],
	['wall', 'Walls'],
	['wood', 'Wood'],
	['earth', 'Earth'],
	['water', 'Water'],
	['flag', 'Flags'],
	['ink', 'Ink'],
	['halo', 'Halo'],
];

/** @type {Design & Record<string, any>} */
let design = { ...DEFAULT_DESIGN };
/** @type {Record<string, any>} */
const drawing = { ...DRAWING };
/** @type {number | null} */
let seed = null;
/** Name shown in the status line and used in export filenames. */
let cultureName = 'Default culture';
/** Key of the loaded culture (preset or import), reused on export; null → slug of the name. @type {string | null} */
let cultureKey = null;

/** @param {Placed[]} items */
function svg(items) {
	const parts = items.flatMap((it) =>
		place(it.piece, { ...it, x: (it.x ?? 0) * K, y: (it.y ?? 0) * K, s: (it.s ?? 1) * K }),
	);
	const {
		layers,
		silhouette,
		bounds: b,
	} = renderLayered(parts, {
		outline: drawing.outline,
		join: design.join,
		softRadius: drawing.softRadius,
	});
	const vb = [b.x - 3, b.y - 3, b.w + 6, b.h + 6].map((n) => n.toFixed(1)).join(' ');
	const paths = LAYERS.filter((l) => layers[l]).map(
		(l) => `<path data-role="${l}" d="${layers[l]}"/>`,
	);
	return `<svg class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"><path class="sil" d="${silhouette}"/>${paths.join('')}</svg>`;
}

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

function render() {
	const t0 = performance.now();
	const ruin = drawing.ruin
		? {
				decay: drawing.decay,
				overgrowth: drawing.overgrowth,
				burned: drawing.burned,
				seed: drawing.layout,
			}
		: null;
	const opts = {
		walls: drawing.walls,
		seed: drawing.layout,
		harbor: drawing.harbor,
		stilts: !!drawing.stilts,
		ruin,
	};
	/** @type {[string, string][]} */
	const towns = TIER_SETS[drawing.tiers].map(
		(tier) =>
			/** @type {[string, string]} */ ([
				`${TEMPLATES[tier].label} · ${TEMPLATES[tier].pop}`,
				svg(settlement(tier, design, opts)),
			]),
	);
	const bits = pieces(design).map(
		([t, items]) =>
			/** @type {[string, string]} */ ([t, svg(ruin ? ruinPlaced(items, ruin) : items)]),
	);
	const card = (/** @type {[string, string]} */ [t, s], cls = '') =>
		`<figure class="${cls}" data-name="${t}">${s}<figcaption>${t}<span class="dl"><button data-fmt="svg">SVG</button><button data-fmt="png">PNG</button></span></figcaption></figure>`;
	$('towns').innerHTML = towns.map((c) => card(c, 'big')).join('');
	$('pieces').innerHTML = bits.map((c) => card(c)).join('');
	$('map').innerHTML = [...towns, ...bits].map(([, s]) => s).join('') + '<span>marker size</span>';
	$('status').textContent = `${cultureName} · rendered in ${Math.round(performance.now() - t0)} ms`;
}

let pending = 0;
function schedule() {
	clearTimeout(pending);
	$('status').textContent = 'Rendering…';
	pending = window.setTimeout(render, 60);
}

/** @param {Knob} k */
function knobValue(k) {
	return k.design ? design[k.key] : drawing[k.key];
}

function buildPanel() {
	const groups = [...new Set(KNOBS.map((k) => k.group))];
	const html = groups
		.map((g) => {
			const rows = KNOBS.filter((k) => k.group === g)
				.map((k) => {
					const id = `k-${k.key}`;
					let input;
					if (k.type === 'range')
						input = `<input type="range" autocomplete="off" id="${id}" min="${k.min}" max="${k.max}" step="${k.step}"><output id="${id}-o"></output>`;
					else if (k.type === 'select')
						input = `<select autocomplete="off" id="${id}">${(k.options ?? []).map((o) => `<option>${o}</option>`).join('')}</select>`;
					else input = `<input type="checkbox" autocomplete="off" id="${id}">`;
					return `<label class="row" for="${id}"><span>${k.label}</span>${input}</label>`;
				})
				.join('');
			return `<fieldset><legend>${g}</legend>${rows}</fieldset>`;
		})
		.join('');
	const colours = COLOUR_ROLES.map(
		([k, label]) =>
			`<label class="row" for="c-${k}"><span>${label}</span><input type="color" autocomplete="off" id="c-${k}"></label>`,
	).join('');
	$('knobs').innerHTML =
		html +
		`<fieldset><legend>Colours</legend>
		<label class="row" for="pal"><span>Palette</span><select autocomplete="off" id="pal">${Object.keys(
			PALETTES,
		)
			.map((p) => `<option>${p}</option>`)
			.join('')}</select></label>${colours}
		<label class="row" for="flagFollow"><span>Flags follow marker</span><input type="checkbox" autocomplete="off" id="flagFollow"></label></fieldset>`;

	for (const k of KNOBS) {
		const el = /** @type {HTMLInputElement} */ ($(`k-${k.key}`));
		el.addEventListener('input', () => {
			const v = k.type === 'check' ? el.checked : k.type === 'range' ? Number(el.value) : el.value;
			(k.design ? design : drawing)[k.key] = v;
			if (k.type === 'range') $(`k-${k.key}-o`).textContent = String(v);
			schedule();
		});
	}
	for (const [k] of COLOUR_ROLES) $(`c-${k}`).addEventListener('input', applyColours);
	$('flagFollow').addEventListener('change', applyColours);
	$('pal').addEventListener('change', () =>
		setPalette(/** @type {HTMLSelectElement} */ ($('pal')).value),
	);
}

function syncPanel() {
	for (const k of KNOBS) {
		const el = /** @type {HTMLInputElement} */ ($(`k-${k.key}`));
		const v = knobValue(k);
		if (k.type === 'check') el.checked = !!v;
		else
			el.value = String(typeof v === 'number' && k.step && k.step < 1 ? Number(v.toFixed(2)) : v);
		if (k.type === 'range') $(`k-${k.key}-o`).textContent = el.value;
	}
}

/** @param {Record<string, string>} p */
function setPaletteColours(p) {
	for (const [k] of COLOUR_ROLES)
		/** @type {HTMLInputElement} */ ($(`c-${k}`)).value = (p[k] ?? '#888888').toLowerCase();
	applyColours();
}

/** @param {string} name */
function setPalette(name) {
	const p = PALETTES[name];
	for (const [k] of COLOUR_ROLES)
		/** @type {HTMLInputElement} */ ($(`c-${k}`)).value = p[k].toLowerCase();
	applyColours();
}

function applyColours() {
	const root = document.documentElement.style;
	const val = (/** @type {string} */ k) => /** @type {HTMLInputElement} */ ($(`c-${k}`)).value;
	for (const [k] of COLOUR_ROLES) root.setProperty(`--${k}`, val(k));
	if (/** @type {HTMLInputElement} */ ($('flagFollow')).checked)
		root.setProperty('--flag', `color-mix(in srgb, ${val('roof')} 70%, ${val('ink')})`);
}

/**
 * Standalone copy of a rendered icon with the current colours baked in
 * (no CSS variables), so it opens anywhere.
 * @param {SVGSVGElement} src
 */
function bakedSvg(src) {
	const out = /** @type {SVGSVGElement} */ (src.cloneNode(true));
	const live = src.querySelectorAll('path');
	out.querySelectorAll('path').forEach((p, i) => {
		const cs = getComputedStyle(live[i]);
		p.setAttribute('fill', toHex(cs.fill));
		if (p.classList.contains('sil')) {
			p.setAttribute('stroke', toHex(cs.stroke));
			p.setAttribute('stroke-width', cs.strokeWidth);
			p.setAttribute('stroke-linejoin', 'round');
		}
		p.removeAttribute('class');
	});
	out.removeAttribute('class');
	const [, , w, h] = (out.getAttribute('viewBox') ?? '0 0 100 100').split(' ').map(Number);
	out.setAttribute('width', String(Math.round(w * 4)));
	out.setAttribute('height', String(Math.round(h * 4)));
	return new XMLSerializer().serializeToString(out);
}

/**
 * Computed colours come back as rgb(...) or, for color-mix() results,
 * color(srgb r g b) — flatten both to #rrggbb so any SVG tool reads them.
 * @param {string} c
 */
function toHex(c) {
	const m = c.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/);
	const rgb = m
		? m.slice(1, 4).map((v) => Math.round(Number(v) * 255))
		: (c.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
	if (rgb.length < 3) return c;
	return '#' + rgb.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}

/** @param {Blob} blob @param {string} name */
function download(blob, name) {
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = name;
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** @param {HTMLElement} fig @param {'svg' | 'png'} fmt */
async function exportIcon(fig, fmt) {
	const src = /** @type {SVGSVGElement} */ (fig.querySelector('svg'));
	const text = bakedSvg(src);
	// Name before any " · population" caption suffix.
	const name = (fig.dataset.name ?? 'icon').split(' · ')[0];
	const base = `${name.toLowerCase().replace(/\s+/g, '-')}-${cultureName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
	if (fmt === 'svg') return download(new Blob([text], { type: 'image/svg+xml' }), `${base}.svg`);
	const img = new Image();
	img.src = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
	await img.decode();
	const scale = 512 / Math.max(img.width, img.height);
	const c = document.createElement('canvas');
	c.width = Math.round(img.width * scale);
	c.height = Math.round(img.height * scale);
	/** @type {CanvasRenderingContext2D} */ (c.getContext('2d')).drawImage(
		img,
		0,
		0,
		c.width,
		c.height,
	);
	URL.revokeObjectURL(img.src);
	c.toBlob((b) => b && download(b, `${base}.png`), 'image/png');
}

/**
 * Apply a culture plugin (`{key, name, note, design, palette}`) to the
 * knobs and colours. Design fields are taken only where the default design
 * has a field of the same type, colours only as #rrggbb — anything else is
 * ignored, so a hand-edited file can't wedge the generator.
 * @param {unknown} raw
 */
function importCulture(raw) {
	if (!raw || typeof raw !== 'object') throw new Error('not a culture object');
	const c = /** @type {Record<string, any>} */ (raw);
	if (!c.design || typeof c.design !== 'object') throw new Error('no "design" object');
	/** @type {Record<string, any>} */
	const next = { ...DEFAULT_DESIGN };
	for (const [k, v] of Object.entries(c.design))
		if (k in DEFAULT_DESIGN && typeof v === typeof (/** @type {any} */ (DEFAULT_DESIGN)[k]))
			next[k] = v;
	design = /** @type {Design} */ (next);
	seed = null;
	cultureName = typeof c.name === 'string' && c.name ? c.name : 'Imported culture';
	cultureKey = typeof c.key === 'string' && /^[a-z0-9-]+$/.test(c.key) ? c.key : null;
	$('note').textContent = typeof c.note === 'string' ? c.note : '';
	/** @type {Record<string, string>} */
	const palette = {};
	for (const [k] of COLOUR_ROLES) {
		const v = c.palette?.[k];
		palette[k] =
			typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)
				? v
				: /** @type {HTMLInputElement} */ ($(`c-${k}`)).value;
	}
	setPaletteColours(palette);
	/** @type {HTMLSelectElement} */ ($('preset')).value = '';
	syncPanel();
	schedule();
}

function init() {
	document.querySelector('main')?.addEventListener('click', (e) => {
		const btn = /** @type {HTMLElement} */ (e.target).closest('button[data-fmt]');
		const fig = btn?.closest('figure');
		if (btn && fig)
			exportIcon(
				/** @type {HTMLElement} */ (fig),
				/** @type {'svg' | 'png'} */ (btn.getAttribute('data-fmt')),
			);
	});
	buildPanel();
	setPalette('Parchment');
	syncPanel();
	const preset = /** @type {HTMLSelectElement} */ ($('preset'));
	preset.innerHTML =
		'<option value="">Preset…</option><option>Default</option>' +
		Object.keys(CULTURES)
			.map((n) => `<option>${n}</option>`)
			.join('');
	preset.addEventListener('change', () => {
		const name = preset.value;
		if (!name) return;
		seed = null;
		if (name === 'Default') {
			design = { ...DEFAULT_DESIGN };
			cultureName = 'Default culture';
			cultureKey = null;
			setPalette('Parchment');
		} else {
			design = { ...DEFAULT_DESIGN, ...CULTURES[name].design };
			cultureName = CULTURES[name].name;
			cultureKey = CULTURES[name].key;
			setPaletteColours(CULTURES[name].palette);
			$('note').textContent = CULTURES[name].note;
		}
		if (name === 'Default') $('note').textContent = '';
		syncPanel();
		schedule();
	});
	$('culture').addEventListener('click', (e) => {
		preset.value = '';
		$('note').textContent = '';
		if (e.shiftKey) {
			seed = null;
			design = { ...DEFAULT_DESIGN };
			cultureName = 'Default culture';
		} else {
			seed = Math.floor(Math.random() * 99999) + 1;
			design = makeDesign(seed);
			cultureName = `Culture #${seed}`;
		}
		cultureKey = null;
		syncPanel();
		schedule();
	});
	$('reset').addEventListener('click', () => {
		Object.assign(drawing, DRAWING);
		syncPanel();
		schedule();
	});
	$('export').addEventListener('click', () => {
		const palette = Object.fromEntries(
			COLOUR_ROLES.map(([k]) => [
				k,
				/** @type {HTMLInputElement} */ ($(`c-${k}`)).value.toUpperCase(),
			]),
		);
		const key =
			cultureKey ??
			cultureName
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-|-$/g, '');
		/** @type {Culture} */
		const culture = {
			key,
			name: cultureName,
			note: $('note').textContent ?? '',
			design: { ...design },
			palette: /** @type {Culture['palette']} */ (palette),
		};
		download(
			new Blob([JSON.stringify(culture, null, 2) + '\n'], { type: 'application/json' }),
			`${key}.json`,
		);
		$('status').textContent = `Exported ${key}.json — drop it in an extension's cultures/ folder`;
	});
	// Import: load a culture plugin file to tweak and re-export.
	const importFile = /** @type {HTMLInputElement} */ ($('importFile'));
	$('import').addEventListener('click', () => importFile.click());
	importFile.addEventListener('change', async () => {
		const file = importFile.files?.[0];
		importFile.value = ''; // so picking the same file again re-imports
		if (!file) return;
		try {
			importCulture(JSON.parse(await file.text()));
			$('status').textContent = `Imported ${file.name}`;
		} catch (err) {
			$('status').textContent =
				`Couldn't import ${file.name}: ${err instanceof Error ? err.message : err}`;
		}
	});
	$('copy').addEventListener('click', async () => {
		const text = JSON.stringify({ seed, design, drawing }, null, 2);
		try {
			await navigator.clipboard.writeText(text);
			$('status').textContent = 'Settings copied to the clipboard';
		} catch {
			window.prompt('Copy these settings:', text);
		}
	});
	render();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
