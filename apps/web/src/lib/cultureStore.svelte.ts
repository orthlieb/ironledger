// =============================================================================
// Iron Ledger — settlement cultures (Svelte 5 module-level $state)
//
// Cultures are extension content: cultures/*.json in the base game and in
// each extension, served merged by /api/catalogue/cultures with a `source`
// tag. The settlement builder offers the cultures of enabled sources, minus
// any an enabled extension supersedes (YRT replaces Elves with Verdani).
//
// Markers store only a culture KEY. resolveCulture() turns a key into the
// definition at draw time, following supersession, and returns null when the
// culture is gone; the generator then draws with the default culture. Like
// extension icons, a culture whose extension is switched off still draws on
// markers already placed — the toggles only gate what the builder offers.
// =============================================================================

import type { Culture } from '$lib/settlement-kit/generate.js';
import {
	isSourceEnabled,
	loadExtensions,
	resolveCultureKey,
	supersededCultureKeys,
} from '$lib/expansionStore.svelte.js';

/** The default culture's key — first in the builder, used when none fits. */
export const DEFAULT_CULTURE = 'ironlanders';

let _cultures = $state<Culture[]>([]);
let _loaded = $state(false);
let _loading: Promise<void> | null = null;

/** Fetch the culture catalogue once per session (retries after a failure). */
export function loadCultures(): Promise<void> {
	_loading ??= (async () => {
		try {
			const [res] = await Promise.all([fetch('/api/catalogue/cultures'), loadExtensions()]);
			if (!res.ok) throw new Error(String(res.status));
			_cultures = ((await res.json()) as { cultures: Culture[] }).cultures;
			_loaded = true;
		} catch {
			_loading = null;
		}
	})();
	return _loading;
}

/** True once the catalogue has arrived (reactive). */
export function culturesLoaded(): boolean {
	return _loaded;
}

/** Every loaded culture, regardless of toggles. */
export function allCultures(): Culture[] {
	return _cultures;
}

/** Cultures the builder offers: enabled sources, not superseded, the default
 *  first and the rest by name. Reactive on the extension toggles. */
export function offeredCultures(): Culture[] {
	const hidden = supersededCultureKeys();
	return _cultures
		.filter((c) => isSourceEnabled(c.source) && !hidden.has(c.key))
		.sort((a, b) =>
			a.key === DEFAULT_CULTURE ? -1 : b.key === DEFAULT_CULTURE ? 1 : a.name.localeCompare(b.name),
		);
}

/** The definition a marker's culture key draws with, or null → default. */
export function resolveCulture(key: string): Culture | null {
	const k = resolveCultureKey(key);
	return _cultures.find((x) => x.key === k) ?? null;
}
