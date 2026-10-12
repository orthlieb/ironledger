// =============================================================================
// Iron Ledger — layered (multi-colour) map icons.
//
// The settlement-kit icons (apps/web/scripts/build-settlement-icons.mjs) are
// drawn as one <path> per COLOUR ROLE — walls, shaded walls, roofs, wood,
// earth, water, flags, ink — plus a `sil` silhouette for the halo, each
// tagged `data-role="…"` — and each colour's outline (`<role>-line`, a
// darker shade of it). Instead of tinting the whole glyph to the marker
// colour (as plain vector icons do), a layered icon keeps its culture's
// palette (carried on the root as `data-palette`) and only its ROOFS take
// the marker colour, so a red marker still reads as "a town with red roofs".
//
// Patterned wall materials (stone, hedge, reef, palisade, earth, bone) draw
// through the settlement kit's own <pattern> defs (settlement-kit/
// patterns.js), so the map and the generated files can't drift apart — flat
// instead in an icon whose culture has Texture off (data-texture="off").
//
// This module is pure (no DOM, no Svelte) so it can be unit-tested; the
// lazy fetch + cache lives in mapIconCache.ts.
// =============================================================================

import {
	PATTERN_ROLES,
	TEXTURE_ROLES,
	flatWall,
	lineColour,
	paletteTone,
	patternDefs,
} from './settlement-kit/patterns.js';
import { PARCHMENT, mix, roleColours, type Palette } from './settlement-kit/palette.js';

/** Base colours of a layered icon; shaded variants are derived. */
export type LayeredPalette = Palette;

/** Parchment — the generator's default palette. */
export const DEFAULT_LAYERED_PALETTE: LayeredPalette = PARCHMENT;

/** One drawable layer of a layered icon. `flat`: a wall drawn in its flat
 *  material colour, never a pattern (its culture has Texture off). */
export interface LayeredPath {
	role: string;
	d: string;
	flat?: boolean;
}

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

/** Mix two `#rrggbb` colours: `t` of `a`, the rest `b` (palette.js). */
export const mixHex = mix;

/** Fill colour for every role, with `roof` replaced by the marker colour
 *  (shaded roofs follow it); non-hex marker colours keep the palette roof.
 *  The generator's own table (palette.js), so file and marker agree. */
export { roleColours };

/** Path data the parser accepts: numbers and path commands only. */
const SAFE_D = /^[MLHVCSQTAZmlhvcsqtaz0-9eE.,\s-]+$/;

/** Pull the `data-role` paths out of a layered SVG file, in paint order. A
 *  file drawn with Texture off (`data-texture="off"` on the root) marks its
 *  walls flat. */
export function parseLayeredSvg(text: string): LayeredPath[] {
	const out: LayeredPath[] = [];
	const flat = /<svg\b[^>]*\sdata-texture\s*=\s*"off"/i.test(text);
	for (const m of text.matchAll(/<path\b([^>]*)>/gi)) {
		const attrs = m[1];
		const role = attrs.match(/\bdata-role\s*=\s*"([\w-]+)"/)?.[1];
		const d = attrs.match(/\sd\s*=\s*"([^"]+)"/)?.[1];
		if (role && d && SAFE_D.test(d))
			out.push(flat && PATTERN_ROLES.has(role) ? { role, d, flat } : { role, d });
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
	detail = true,
): string {
	// Pattern defs for any wall-roled path the icon uses — or none at all
	// when the icon is too small for a pattern to read (`detail` false): its
	// walls then take flat material colours, and its line-work texture
	// (masonry, planks, wall seams, ring line-work) is left out. Pass a
	// per-instance `scope`: shared ids resolve to the first copy in the
	// document, and a copy inside a display:none subtree (a closed picker,
	// say) never paints.
	scope ??= colours.ink.replace('#', '');
	const { defs } = detail
		? patternDefs(
				paths.filter((p) => !p.flat).map((p) => p.role),
				(role) => paletteTone(role, colours.ink, mixHex),
				scope,
			)
		: { defs: '' };
	let s = defs;
	for (const { role, d, flat } of paths) {
		if (role === 'sil') {
			if (haloAttrs !== null) s += `<path fill="${colours.sil}"${haloAttrs} d="${d}"/>`;
			continue;
		}
		if (!detail && TEXTURE_ROLES.has(role)) continue;
		if (PATTERN_WALL_ROLES.has(role)) {
			const fill =
				detail && !flat ? `url(#pat-${role}-${scope})` : flatWall(role, colours.ink, mixHex);
			s += `<path fill="${fill}" d="${d}"/>`;
			continue;
		}
		// An outline takes a darker shade of what it edges — a roof's follows
		// the marker colour, as the roof does.
		const fill = role.endsWith('-line') ? lineColour(role, colours, mixHex) : colours[role];
		if (fill) s += `<path fill="${fill}" d="${d}"/>`;
	}
	return s;
}
