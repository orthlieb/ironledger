// =============================================================================
// Iron Ledger — a map marker's label: where it sits, and how it's styled
//
// Pure helpers MapDialog draws marker labels with: the SVG placement of a
// label at each of its eight positions around the icon, and the inline style
// for its emphasis (bold, italic, underline, case, size).
// =============================================================================

import type { MapMarker } from '#lib/mapStore.svelte.js';

// Marker text emphasis — bold/italic/small-caps/underline flags on
// `m.labelStyle`. Serialised straight into the SVG `<text>`'s style
// attribute so every combination is legal and there's no need for
// a matrix of CSS classes. Empty for unstyled markers, which keeps
// the persisted marker byte-identical for pre-styling data.
// Where the label sits relative to the icon, expressed as SVG text
// placement (x, y, text-anchor, dominant-baseline). `extent` is the
// icon's world-unit half-size at the current zoom — the label offsets
// clear that edge by LABEL_GAP so it never bites into the icon.
// Diagonals use the same edge offset on both axes, so the label sits
// outside the icon's bounding rect (its inner corner is one `gap`
// from the icon's corner) rather than straddling it.
//
// Vertical positions (top/bottom + the four diagonals) key off the
// alphabetic baseline, which every browser agrees is at y=y — no
// interpretation of em-box top / hanging line / ascender vs cap
// height is involved.
//
//   • Top / diagonals-top: baseline at y = −straight → visible
//     bottom of caps lands on the gap boundary.
//   • Bottom / diagonals-bottom: baseline at y = +straight +
//     capHeight → visible cap top lands on the gap boundary.
//   • Left / right: label's icon-facing edge at x =
//     ±(straight + hExtra) — text-anchor: end for left, start
//     for right — so the label respects the standoff the same
//     way top / bottom do (nearest edge on the boundary, rest of
//     the label extending outward). Vertically centered on the
//     CAP height (baseline at y = capHeight/2) so the caps'
//     vertical center lands on the icon's y-axis.
//     `dominant-baseline: central` would center the em box, which
//     isn't the caps' center: the em's ascent and descent aren't the
//     caps' (Fira Sans: 0.94 and 0.27 of the size, caps 0.69), so
//     `central` drifts the visible caps off y=0 — and by however
//     much the font's metrics say, not by a measured constant.
//
// The cap-height constant is a fraction of the *actual rendered*
// font-size (base × labelStyle.size multiplier), so xl labels don't
// drift outward as they scale up.
export type LabelPos = NonNullable<MapMarker['labelPosition']>;
export interface LabelPlacement {
	x: number;
	y: number;
	anchor: 'start' | 'middle' | 'end';
	baseline: 'alphabetic';
}
// Fira Sans cap-height = 689 / 1000 units (the label font — see
// .mp-marker-label). Swap this if the label font family changes.
export const LABEL_CAP_HEIGHT = 0.69;
export function labelPlacement(
	pos: LabelPos,
	extent: number,
	gap: number,
	fontSize: number,
): LabelPlacement {
	const straight = extent + gap;
	const capHeight = fontSize * LABEL_CAP_HEIGHT;
	const yTop = -straight;
	const yBottom = straight + capHeight;
	const yCapCenter = capHeight / 2;
	// Horizontal labels get a small extra offset: horizontal text next
	// to a small icon reads visually tighter than the same distance
	// vertically, and a hair more breathing room brings them in line
	// with how top / bottom feel. Empirically matched against the
	// label-standoffs reference diagram.
	const hExtra = 0.03;
	const xLeft = -(straight + hExtra);
	const xRight = straight + hExtra;
	switch (pos) {
		case 'top':
			return { x: 0, y: yTop, anchor: 'middle', baseline: 'alphabetic' };
		case 'bottom':
			return { x: 0, y: yBottom, anchor: 'middle', baseline: 'alphabetic' };
		case 'left':
			return { x: xLeft, y: yCapCenter, anchor: 'end', baseline: 'alphabetic' };
		case 'right':
			return { x: xRight, y: yCapCenter, anchor: 'start', baseline: 'alphabetic' };
		case 'top-left':
			return { x: -straight, y: yTop, anchor: 'end', baseline: 'alphabetic' };
		case 'top-right':
			return { x: straight, y: yTop, anchor: 'start', baseline: 'alphabetic' };
		case 'bottom-left':
			return { x: -straight, y: yBottom, anchor: 'end', baseline: 'alphabetic' };
		case 'bottom-right':
			return { x: straight, y: yBottom, anchor: 'start', baseline: 'alphabetic' };
	}
}

/** Multiplier ramp for labelStyle.size. `md` is the default (1×) and
 *  emits no override, keeping every pre-sizing marker's persisted row
 *  byte-identical. sm / lg / xl scale relative to the base font-size
 *  set in .mp-marker-label CSS (mobile 0.48 px, desktop 0.24 px world
 *  units at zoom 1). */
export const LABEL_SIZE_MULT: Record<
	NonNullable<NonNullable<MapMarker['labelStyle']>['size']>,
	number
> = {
	sm: 0.75,
	md: 1,
	lg: 1.5,
	xl: 2.25,
};
export function labelStyleCss(ls: MapMarker['labelStyle']): string {
	if (!ls) return '';
	const parts: string[] = [];
	// Fira Sans loads real 400 / 700 / 800 (roman + italic — see
	// app.html); bold uses 800 for maximum weight contrast against
	// the 400 base while still keeping a real italic face when
	// bold and italic combine.
	if (ls.bold) parts.push('font-weight:800');
	if (ls.italic) parts.push('font-style:italic');
	if (ls.underline) parts.push('text-decoration:underline');
	// Small caps via `font-variant: small-caps`. The font's real
	// `smcp` OpenType feature is used when present; otherwise the
	// browser synthesises small caps by scaling full caps — as it
	// does for Fira Sans as Google Fonts serves it. Using
	// `font-feature-settings: "smcp"` here would silently render as
	// lowercase where the feature is missing (no fallback path), so
	// the variant form is the right choice.
	if (ls.case === 'small-caps') parts.push('font-variant:small-caps');
	else if (ls.case === 'uppercase') parts.push('text-transform:uppercase');
	// Only emit a size override for non-default tiers so labels that
	// stay at `md` (or omit the field entirely) don't carry a
	// redundant CSS custom property.
	if (ls.size && ls.size !== 'md') parts.push(`--label-size-mult:${LABEL_SIZE_MULT[ls.size]}`);
	return parts.join(';');
}
