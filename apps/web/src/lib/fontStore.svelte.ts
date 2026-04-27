/**
 * fontStore.svelte.ts — Reactive heading-font state.
 *
 * Manages the three heading font modes (Cinzel / Simonetta / Futhark) and
 * exposes `headingText()` so components can reactively transliterate names
 * into Elder Futhark when that mode is active.
 *
 * Usage in any component:
 *   import { headingText } from '$lib/fontStore.svelte.js';
 *   // in template: {headingText(character.name)}
 */

import { toFuthark } from './futhark.js';

export type FontDisplay = 'cinzel' | 'simonetta' | 'futhark';

export const FONT_DISPLAY_KEY = 'ironledger:font:display';

export const FONT_STACKS: Record<FontDisplay, string> = {
	cinzel:    "'Cinzel', 'Palatino Linotype', Georgia, serif",
	simonetta: "'Simonetta', 'Palatino Linotype', Georgia, serif",
	futhark:   "'Segoe UI Historic', 'Noto Sans Runic', 'Apple Symbols', system-ui, sans-serif",
};

// ── Reactive state ────────────────────────────────────────────────────────────

function _readSaved(): FontDisplay {
	if (typeof window === 'undefined') return 'cinzel';
	const v = localStorage.getItem(FONT_DISPLAY_KEY);
	if (v === 'simonetta' || v === 'futhark') return v as FontDisplay;
	return 'cinzel';
}

let _font = $state<FontDisplay>(_readSaved());

// ── Getters / setters ─────────────────────────────────────────────────────────

export function getFontDisplay(): FontDisplay { return _font; }

export function savedFont(): FontDisplay { return _readSaved(); }

/** Apply a font mode: persists to localStorage, updates DOM attributes + CSS var. */
export function setFontDisplay(f: FontDisplay): void {
	_font = f;
	if (f === 'cinzel') {
		localStorage.removeItem(FONT_DISPLAY_KEY);
		document.documentElement.removeAttribute('data-font');
	} else {
		localStorage.setItem(FONT_DISPLAY_KEY, f);
		document.documentElement.setAttribute('data-font', f);
	}
	document.documentElement.style.setProperty('--font-display', FONT_STACKS[f]);
}

// ── Text helper ───────────────────────────────────────────────────────────────

/**
 * Return `text` unchanged in Cinzel/Simonetta mode, or transliterated to
 * Elder Futhark runes when the Futhark font is active.
 *
 * Because this function reads `_font` (a `$state`), calling it inside a
 * Svelte template or a `$derived` expression creates a reactive dependency —
 * the component re-renders automatically when the font mode changes.
 */
export function headingText(text: string): string {
	return _font === 'futhark' ? toFuthark(text) : text;
}
