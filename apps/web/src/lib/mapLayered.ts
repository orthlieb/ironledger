// =============================================================================
// Iron Ledger — layered (multi-colour) map icons.
//
// The settlement-kit icons (apps/web/scripts/build-settlement-icons.mjs) are
// drawn as one <path> per COLOUR ROLE — walls, shaded walls, roofs, wood,
// earth, water, flags, ink — plus a `sil` silhouette for the halo, each
// tagged `data-role="…"`. Instead of tinting the whole glyph to the marker
// colour (as plain vector icons do), a layered icon keeps its culture's
// palette (carried on the root as `data-palette`) and only its ROOFS take
// the marker colour, so a red marker still reads as "a town with red roofs".
//
// This module is pure (no DOM, no Svelte) so it can be unit-tested; the
// lazy fetch + cache lives in mapIconCache.ts.
// =============================================================================

/** Base colours of a layered icon; shaded variants are derived. */
export interface LayeredPalette {
	wall: string;
	roof: string;
	wood: string;
	earth: string;
	water: string;
	flag: string;
	ink: string;
	halo: string;
}

/** Parchment — the generator's default palette. */
export const DEFAULT_LAYERED_PALETTE: LayeredPalette = {
	wall: '#EFEADF',
	roof: '#D9776B',
	wood: '#C9A97C',
	earth: '#94744F',
	water: '#8FB0B8',
	flag: '#4A3B32',
	ink: '#3B2F28',
	halo: '#F4EFE4',
};

/** One drawable layer of a layered icon. */
export interface LayeredPath {
	role: string;
	d: string;
}

/** How much of the base colour each shaded role keeps (the rest is ink). */
const SHADE_MIX: Record<string, number> = {
	'wall-shade': 0.8,
	'wall-stone-shade': 0.8,
	'wall-hedge-shade': 0.8,
	'wall-reef-shade': 0.8,
	'wood-shade': 0.75,
	'earth-shade': 0.75,
	'water-shade': 0.8,
	'roof-shade': 0.7,
};

/** Material-specific wall roles that take an SVG `<pattern>` fill
 *  (settlement-kit/patterns.js) in place of a flat colour, plus their
 *  -shade variants. Keep in sync with PATTERN_ROLES there. */
export const PATTERN_WALL_ROLES = new Set([
	'wall-stone',
	'wall-stone-shade',
	'wall-hedge',
	'wall-hedge-shade',
	'wall-reef',
	'wall-reef-shade',
]);

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Parse a `data-palette="wall:#…;roof:#…"` attribute value. Unknown keys
 * are ignored and anything malformed falls back to the default palette, so
 * a hand-edited file can never inject markup through a colour.
 */
export function parsePalette(attr: string | undefined | null): LayeredPalette {
	const out: LayeredPalette = { ...DEFAULT_LAYERED_PALETTE };
	for (const pair of (attr ?? '').split(';')) {
		const [k, v] = pair.split(':').map((s) => s.trim());
		if (k in out && HEX.test(v ?? '')) out[k as keyof LayeredPalette] = v;
	}
	return out;
}

/** Mix two `#rrggbb` colours: `t` of `a`, the rest `b`. */
export function mixHex(a: string, b: string, t: number): string {
	const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
	const parts = [0, 1, 2].map((i) => Math.round(ch(a, i) * t + ch(b, i) * (1 - t)));
	return '#' + parts.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Normalise `#rgb` / `#rrggbb[aa]` to `#rrggbb`; anything else → undefined. */
function toHex6(c: string): string | undefined {
	if (/^#[0-9a-fA-F]{3}$/.test(c))
		return (
			'#' +
			c
				.slice(1)
				.split('')
				.map((x) => x + x)
				.join('')
		);
	if (/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(c)) return c.slice(0, 7);
	return undefined;
}

/**
 * Fill colour for every role, with `roof` replaced by the marker colour
 * (shaded roofs follow it). Non-hex marker colours keep the palette roof.
 */
export function roleColours(p: LayeredPalette, roof?: string): Record<string, string> {
	const r = (roof && toHex6(roof)) ?? p.roof;
	const base: Record<string, string> = {
		wall: p.wall,
		// Material-specific wall bodies share the wall colour; the pattern
		// (brick, hedge-stipple, coral) is layered on top in layeredMarkup().
		'wall-stone': p.wall,
		'wall-hedge': p.wall,
		'wall-reef': p.wall,
		roof: r,
		wood: p.wood,
		earth: p.earth,
		water: p.water,
		flag: p.flag,
		ink: p.ink,
		sil: p.halo,
	};
	for (const [role, keep] of Object.entries(SHADE_MIX)) {
		const from = base[role.replace('-shade', '')];
		base[role] = mixHex(from, p.ink, keep);
	}
	return base;
}

/** Path data the parser accepts: numbers and path commands only. */
const SAFE_D = /^[MLHVCSQTAZmlhvcsqtaz0-9eE.,\s-]+$/;

/** Pull the `data-role` paths out of a layered SVG file, in paint order. */
export function parseLayeredSvg(text: string): LayeredPath[] {
	const out: LayeredPath[] = [];
	for (const m of text.matchAll(/<path\b([^>]*)>/gi)) {
		const attrs = m[1];
		const role = attrs.match(/\bdata-role\s*=\s*"([\w-]+)"/)?.[1];
		const d = attrs.match(/\sd\s*=\s*"([^"]+)"/)?.[1];
		if (role && d && SAFE_D.test(d)) out.push({ role, d });
	}
	return out;
}

/**
 * Inner markup for a layered icon. The silhouette (`sil`) is only drawn
 * when a halo is wanted, and carries the halo stroke; every other layer is
 * a plain fill in its role colour. Material-specific wall roles get an
 * SVG `<pattern>` fill — their defs are prepended, and the path's fill
 * swaps to `url(#…)`.
 */
export function layeredMarkup(
	paths: LayeredPath[],
	colours: Record<string, string>,
	haloAttrs: string | null,
	scope: string = 'x',
): string {
	// Pattern defs for any wall-roled path the icon uses, keyed by scope so
	// two icons on the same page don't collide on `#pat-wall-stone`.
	const patterned = paths.filter((p) => PATTERN_WALL_ROLES.has(p.role));
	let defs = '';
	if (patterned.length) {
		const used = new Set(patterned.map((p) => p.role));
		defs = '<defs>';
		for (const role of used) {
			defs += patternSvg(role, colours[role] ?? colours.wall, colours.ink, scope);
		}
		defs += '</defs>';
	}
	let s = defs;
	for (const { role, d } of paths) {
		if (role === 'sil') {
			if (haloAttrs !== null) s += `<path fill="${colours.sil}"${haloAttrs} d="${d}"/>`;
			continue;
		}
		if (PATTERN_WALL_ROLES.has(role)) {
			s += `<path fill="url(#pat-${role}-${scope})" d="${d}"/>`;
			continue;
		}
		const fill = colours[role];
		if (fill) s += `<path fill="${fill}" d="${d}"/>`;
	}
	return s;
}

/** Inner body of a `<pattern>` for a material-wall role. Mirrors the
 *  settlement-kit's own patterns.js — kept here so the main app can
 *  recolour at render time without re-fetching the icon. */
function patternSvg(role: string, fill: string, ink: string, scope: string): string {
	const w = role.startsWith('wall-stone') ? 4.4 : role.startsWith('wall-hedge') ? 5 : 6;
	const h = role.startsWith('wall-stone') ? 4.8 : role.startsWith('wall-hedge') ? 5 : 6;
	let body: string;
	if (role.startsWith('wall-stone')) {
		body =
			`<rect width="4.4" height="4.8" fill="${fill}"/>` +
			`<path stroke="${ink}" stroke-width="0.3" fill="none" d="M0 0h4.4M0 2.4h4.4M0 0v2.4M4.4 0v2.4M2.2 2.4v2.4"/>`;
	} else if (role.startsWith('wall-hedge')) {
		body =
			`<rect width="5" height="5" fill="${fill}"/>` +
			`<g fill="${ink}" fill-opacity="0.42">` +
			'<circle cx="1.1" cy="1.2" r="0.9"/>' +
			'<circle cx="3.4" cy="0.7" r="0.75"/>' +
			'<circle cx="4.5" cy="2.4" r="0.85"/>' +
			'<circle cx="2.4" cy="2.6" r="0.7"/>' +
			'<circle cx="0.4" cy="3.4" r="0.8"/>' +
			'<circle cx="3.7" cy="4.1" r="0.9"/>' +
			'<circle cx="1.7" cy="4.5" r="0.75"/>' +
			'</g>';
	} else {
		body =
			`<rect width="6" height="6" fill="${fill}"/>` +
			`<g fill="${ink}" fill-opacity="0.55">` +
			'<path d="M1.1 1.6l0.1 -1 0.2 1 1 0.1-1 0.2-0.1 1-0.2-1-1-0.2z"/>' +
			'<path d="M4.3 0.8l0.1 -0.8 0.2 0.8 0.8 0.1-0.8 0.2-0.1 0.8-0.2-0.8-0.8-0.2z"/>' +
			'<circle cx="2.6" cy="2.6" r="0.4"/>' +
			'<path d="M5 3.6l0.1 -1 0.2 1 1 0.1-1 0.2-0.1 1-0.2-1-1-0.2z"/>' +
			'<circle cx="0.8" cy="4.1" r="0.5"/>' +
			'<path d="M3.3 4.6l0.1 -0.8 0.2 0.8 0.8 0.1-0.8 0.2-0.1 0.8-0.2-0.8-0.8-0.2z"/>' +
			'<circle cx="5.2" cy="5.5" r="0.4"/>' +
			'</g>';
	}
	return `<pattern id="pat-${role}-${scope}" width="${w}" height="${h}" patternUnits="userSpaceOnUse">${body}</pattern>`;
}
