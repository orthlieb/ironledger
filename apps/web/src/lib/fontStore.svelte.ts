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
 * on. This store only tracks the active id + applies the transliteration a
 * livery may request (e.g. Elder Futhark runes).
 *
 * Usage in any component:
 *   import { headingText } from '$lib/fontStore.svelte.js';
 *   // in template: {headingText(character.name)}
 */

import { toFuthark } from './futhark.js';
import manifest from './liveries.manifest.json';

/** A livery id (the folder slug). Kept as a string since liveries are data. */
export type LiveryId = string;
/** @deprecated Historical name — a livery is more than a font. Use `LiveryId`. */
export type FontDisplay = LiveryId;

export interface LiveryMeta {
	id: string;
	label: string;
	default: boolean;
	description: string;
	preview: string | null;
	transliterate: string | null;
	googleFamily: string | null;
}

export const LIVERIES: LiveryMeta[] = manifest.liveries;
export const DEFAULT_LIVERY: LiveryId = manifest.default;
const IDS = new Set(LIVERIES.map((l) => l.id));

export const FONT_DISPLAY_KEY = 'ironledger:font:display';

// Named text transformers a livery may request via its `transliterate` field.
// A livery with `transliterate: null` (the common case) uses the identity.
const TRANSLITERATORS: Record<string, (t: string) => string> = {
	'elder-futhark': toFuthark,
};

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

/** Apply a livery: persists to localStorage + flips the `data-font` attribute.
 *
 *  `data-font` is set for ALL liveries — including the default — so the
 *  `[data-font='<default>']`-scoped rules in liveries.generated.css match.
 *  localStorage skips writing the default so a "no user preference" state
 *  stays represented by an absent storage entry. The generated CSS supplies
 *  the font stack (`--font-display`) and chrome palette for the attribute,
 *  so there is nothing else to set here. Unknown ids fall back to default. */
export function setFontDisplay(f: LiveryId): void {
	if (!IDS.has(f)) f = DEFAULT_LIVERY;
	_font = f;
	if (f === DEFAULT_LIVERY) {
		localStorage.removeItem(FONT_DISPLAY_KEY);
	} else {
		localStorage.setItem(FONT_DISPLAY_KEY, f);
	}
	document.documentElement.setAttribute('data-font', f);
}

// ── Text helper ───────────────────────────────────────────────────────────────

/**
 * Return `text` unchanged, or transliterated when the active livery requests a
 * transformer (e.g. Elder Futhark runes in the Futhark livery).
 *
 * Because this function reads `_font` (a `$state`), calling it inside a
 * Svelte template or a `$derived` expression creates a reactive dependency —
 * the component re-renders automatically when the livery changes.
 */
export function headingText(text: string): string {
	const lv = LIVERIES.find((l) => l.id === _font);
	const fn = lv?.transliterate ? TRANSLITERATORS[lv.transliterate] : null;
	return fn ? fn(text) : text;
}
