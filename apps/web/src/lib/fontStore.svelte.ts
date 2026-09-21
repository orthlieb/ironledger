/**
 * fontStore.svelte.ts — Reactive livery (heading-font + chrome) state.
 *
 * A "livery" pairs a display font with an optional chrome palette. The set of
 * liveries is data-driven: each lives in `liveries/<id>/livery.json` and is
 * compiled at build time into `liveries.manifest.json` (metadata, read here)
 * and `liveries.generated.css` (the `[data-font='<id>']` typography + palette
 * blocks, imported by +layout.svelte). To add a livery, drop in a folder and
 * run `npm run gen:liveries` — no edit to this file is needed.
 *
 * The generated CSS owns the font stack (`--font-display`) and chrome, so
 * switching liveries is just flipping the `data-font` attribute the CSS keys
 * on. This store only tracks the active id and exposes helpers keyed off it.
 *
 * Usage in any component:
 *   import { headingText } from '$lib/fontStore.svelte.js';
 *   // in template: {headingText(character.name)}
 */

import manifest from './liveries.manifest.json';

/** A livery id (the folder slug). Kept as a string since liveries are data. */
export type LiveryId = string;
/** @deprecated Historical name — a livery is more than a font. Use `LiveryId`. */
export type FontDisplay = LiveryId;

/** A livery's 3D-dice appearance: the four die backgrounds (d6 action, d10
 *  challenge, and the d100 tens + ones) plus one shared texture. */
export interface LiveryDice {
	action: string;
	challenge: string;
	tens: string;
	ones: string;
	texture: string;
}

/** Compact per-theme preview colours — bg-page + text-accent — pulled from
 *  the livery's palette (or the base app tokens for a null-palette livery).
 *  Consumed by SettingsDialog's livery picker to render a preview swatch. */
export interface LiveryPreviewColors {
	dark: { bg: string; fg: string };
	light: { bg: string; fg: string };
}

export interface LiveryMeta {
	id: string;
	label: string;
	default: boolean;
	description: string;
	preview: string | null;
	googleFamily: string | null;
	dice: LiveryDice | null;
	previewColors: LiveryPreviewColors;
	/** Optional raw SVG a livery may ship at `liveries/<id>/brand.svg`. When
	 *  present, the nav brand icon and the favicon both switch to it while
	 *  this livery is active. Absent → the default sharp-axe stays. */
	brandSvg?: string;
}

export const LIVERIES: LiveryMeta[] = manifest.liveries;
export const DEFAULT_LIVERY: LiveryId = manifest.default;
const IDS = new Set(LIVERIES.map((l) => l.id));

export const FONT_DISPLAY_KEY = 'ironledger:font:display';

// ── Reactive state ────────────────────────────────────────────────────────────

function _readSaved(): LiveryId {
	if (typeof window === 'undefined') return DEFAULT_LIVERY;
	const v = localStorage.getItem(FONT_DISPLAY_KEY);
	return v && IDS.has(v) ? v : DEFAULT_LIVERY;
}

let _font = $state<LiveryId>(_readSaved());

// ── Getters / setters ─────────────────────────────────────────────────────────

export function getFontDisplay(): LiveryId {
	return _font;
}

export function savedFont(): LiveryId {
	return _readSaved();
}

/** The active livery's dice appearance, or null if it doesn't define one.
 *  Read imperatively by the dice roller so switching liveries restyles the
 *  dice on the next roll (a user's explicit Settings override still wins). */
export function activeLiveryDice(): LiveryDice | null {
	return LIVERIES.find((l) => l.id === _font)?.dice ?? null;
}

/** The active livery's brand SVG (raw markup) — the nav mark uses it in
 *  place of the default sharp-axe when present. Reactive: reads the
 *  `_font` state, so callers inside a Svelte template or `$derived`
 *  re-render on livery change. */
export function activeLiveryBrand(): string | null {
	return LIVERIES.find((l) => l.id === _font)?.brandSvg ?? null;
}

// URL-encode an SVG string for use in a data: URI. Cheaper than base64 for
// SVG (base64 bloats ~33%, encodeURIComponent leaves most ASCII intact).
function svgToDataUrl(svg: string, cacheKey: string): string {
	return `data:image/svg+xml,${encodeURIComponent(svg)}#${cacheKey}`;
}

/** Swap the browser tab icon to the current livery's brand SVG, or restore
 *  the default static `/favicon.svg` when the active livery doesn't ship one.
 *  The old <link rel="icon" type="image/svg+xml"> is removed and a fresh one
 *  appended — the rebuild is how Safari picks up the change; Chrome + Firefox
 *  accept either an in-place href swap or a re-append, so re-append covers
 *  both. The `apple-touch-icon` stays static (it's baked in at "add to home
 *  screen" time, no way to swap it at runtime). */
function updateFavicon(id: LiveryId, svg: string | null): void {
	if (typeof document === 'undefined') return;
	const head = document.head;
	const old = head.querySelector('link[rel="icon"][type="image/svg+xml"]');
	old?.remove();
	const link = document.createElement('link');
	link.rel = 'icon';
	link.type = 'image/svg+xml';
	link.href = svg ? svgToDataUrl(svg, id) : '/favicon.svg?v=2';
	head.appendChild(link);
}

/** Apply a livery: persists to localStorage + flips the `data-font` attribute.
 *
 *  `data-font` is set for ALL liveries — including the default — so the
 *  `[data-font='<default>']`-scoped rules in liveries.generated.css match.
 *  localStorage skips writing the default so a "no user preference" state
 *  stays represented by an absent storage entry. The generated CSS supplies
 *  the font stack (`--font-display`) and chrome palette for the attribute.
 *  Also swaps the tab favicon to the livery's brand SVG when it ships one,
 *  restoring the default static icon otherwise. Unknown ids fall back to
 *  default. */
export function setFontDisplay(f: LiveryId): void {
	if (!IDS.has(f)) f = DEFAULT_LIVERY;
	_font = f;
	if (f === DEFAULT_LIVERY) {
		localStorage.removeItem(FONT_DISPLAY_KEY);
	} else {
		localStorage.setItem(FONT_DISPLAY_KEY, f);
	}
	document.documentElement.setAttribute('data-font', f);
	updateFavicon(f, LIVERIES.find((l) => l.id === f)?.brandSvg ?? null);
}

// ── Text helper ───────────────────────────────────────────────────────────────

/**
 * Return `text` unchanged. Kept as a helper for two reasons: (1) call sites
 * remain uniform whether or not a future livery ever wants to transform its
 * display text again, and (2) reading `_font` (a `$state`) inside a Svelte
 * template creates a reactive dependency, so components re-render when the
 * livery changes even though the string is unmodified today.
 */
export function headingText(text: string): string {
	void _font;
	return text;
}
