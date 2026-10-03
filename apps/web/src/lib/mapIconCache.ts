// =============================================================================
// Iron Ledger — lazy loader for layered map icons.
//
// Layered settlement icons are 2–80 KB of path data each, so the manifest
// doesn't inline them (that would add megabytes to the bundle). Instead it
// carries a `src` URL, and this cache fetches each file the first time a
// marker, the picker or a preview draws it. The cache is a SvelteMap, so a
// template that rendered "not loaded yet" re-renders once the file arrives.
// =============================================================================

import { SvelteMap } from 'svelte/reactivity';
import { parseLayeredSvg, type LayeredPath } from './mapLayered.js';

const loaded = new SvelteMap<string, LayeredPath[]>();
const pending = new Set<string>();

/**
 * Parsed layers for a layered icon, or `undefined` while it loads (callers
 * draw nothing until then). Reading this inside a template subscribes it to
 * the load.
 */
export function layeredPaths(src: string): LayeredPath[] | undefined {
	const hit = loaded.get(src);
	if (hit) return hit;
	if (!pending.has(src) && typeof fetch === 'function') {
		pending.add(src);
		fetch(src)
			.then((r) => (r.ok ? r.text() : ''))
			.then((text) => {
				const paths = parseLayeredSvg(text);
				if (paths.length) loaded.set(src, paths);
			})
			.catch(() => {
				/* offline / missing file: keep drawing nothing */
			})
			.finally(() => pending.delete(src));
	}
	return undefined;
}

/** Seed the cache directly (tests, or a caller that already has the file). */
export function primeLayered(src: string, text: string): void {
	loaded.set(src, parseLayeredSvg(text));
}
