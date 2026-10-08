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
// Patterned wall materials (stone, hedge, reef, palisade, earth, bone) draw
// through the settlement kit's own <pattern> defs (settlement-kit/
// patterns.js), so the map and the generated files can't drift apart.
//
// This module is pure (no DOM, no Svelte) so it can be unit-tested; the
// lazy fetch + cache lives in mapIconCache.ts.
// =============================================================================

import { PATTERN_ROLES, paletteTone, patternDefs } from './settlement-kit/patterns.js';

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

/** How much of the base colour each shaded role keeps (the rest is ink).
 *  Patterned wall roles shade inside their pattern tiles instead. */
const SHADE_MIX: Record<string, number> = {
	'wall-shade': 0.8,
	'wood-shade': 0.75,
	'earth-shade': 0.75,
	'water-shade': 0.8,
	'roof-shade': 0.7,
};

/** Material-specific wall roles that take an SVG `<pattern>` fill
 *  (settlement-kit/patterns.js) in place of a flat colour, plus their
 *  -shade variants. */
export const PATTERN_WALL_ROLES: ReadonlySet<string> = PATTERN_ROLES;

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
	scope?: string,
): string {
	// Pattern defs for any wall-roled path the icon uses. Ids are scoped by
	// the colours the tiles bake in (stone takes the wall colour, every
	// shade tile the ink), so icons in different palettes on one map never
	// pick up each other's tiles, while same-palette icons share them.
	scope ??= `${colours.wall}${colours.ink}`.replace(/#/g, '');
	const { defs } = patternDefs(
		paths.map((p) => p.role),
		(role) => paletteTone(role, colours.wall, colours.ink, mixHex),
		scope,
	);
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
