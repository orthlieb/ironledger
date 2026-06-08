// =============================================================================
// Iron Ledger — Foe Store (Svelte 5 module-level $state)
//
// Provides:
//   • loadFoes()              — fetch + cache foe catalogue (idempotent)
//   • getFoes()               — full list of FoeDef (reactive, unfiltered)
//   • getVisibleFoes()        — foes filtered by enabled expansions + overrides
//   • getFoeNatures()         — distinct nature values in display order
//   • getFoeSources()         — distinct source tags ('base'|'delve'|'yrt')
//   • getVisibleFoeSources()  — visible sources after filtering
//   • findFoe(id)             — lookup by id (never filtered)
//   • resolveFoeDescription() — description + active-expansion addenda
//
// Expansion foe overrides:
//   Each expansion may ship a foes_overrides_<source>.json that marks
//   base foes as absent or attaches a setting-specific addendum. Overrides
//   apply only while that expansion is enabled. They affect the picker
//   (visibility) and the rendered description; findFoe/findFoeByName are
//   never filtered so existing FoeEncounter records keep resolving.
//
// Constants re-exported for use in components:
//   • FOE_RANKS               — rank label + mechanics
//   • FOE_QUANTITIES          — quantity options with rank adjustments
//   • FOE_NATURE_COLORS       — nature → CSS hex colour
// =============================================================================

import type { FoeDef, FoeNature, CatalogueSource } from '$lib/types.js';
import { isSourceEnabled } from '$lib/expansionStore.svelte.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FoeOverride {
	present?: boolean;
	addendum?: string;
}

export interface FoeOverridesFile {
	source: CatalogueSource;
	overrides: Record<string, FoeOverride>;
}

// ---------------------------------------------------------------------------
// Module-level state (shared across all component instances)
// ---------------------------------------------------------------------------

let _foes: FoeDef[] = $state([]);
let _overrides: FoeOverridesFile[] = $state([]);
let _loading = $state(false);
let _loaded = false;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const RANK_COLORS: Record<number, { bg: string; text: string }> = {
	1: { bg: '#2B2B2B', text: '#E0E0E0' },
	2: { bg: '#7A1E1E', text: '#FFD0D0' },
	3: { bg: '#C53A2D', text: '#FFFFFF' },
	4: { bg: '#FF7A2F', text: '#1C0800' },
	5: { bg: '#FF2E2E', text: '#FFFFFF' },
};

export const FOE_RANKS: Record<number, { label: string; progressPerHit: number; harm: number }> = {
	1: { label: 'Troublesome', progressPerHit: 12, harm: 1 },
	2: { label: 'Dangerous', progressPerHit: 8, harm: 2 },
	3: { label: 'Formidable', progressPerHit: 4, harm: 3 },
	4: { label: 'Extreme', progressPerHit: 2, harm: 4 },
	5: { label: 'Epic', progressPerHit: 1, harm: 5 },
};

export const FOE_QUANTITIES: Array<{
	value: 'solo' | 'pack' | 'horde';
	label: string;
	rankAdj: number;
	desc: string;
}> = [
	{ value: 'solo', label: 'Solo', rankAdj: 0, desc: 'One foe' },
	{ value: 'pack', label: 'Pack (2–4)', rankAdj: 1, desc: '+1 rank' },
	{ value: 'horde', label: 'Horde (5+)', rankAdj: 2, desc: '+2 ranks' },
];

export const FOE_NATURE_COLORS: Record<FoeNature, string> = {
	Ironlander: '#7A9AB8',
	Firstborn: '#B87AE8',
	Animal: '#3DBF82',
	Beast: '#F08840',
	Horror: '#E03050',
	Anomaly: '#20BCCC',
	Construct: '#A8A8A8',
};

// Source order for display
const SOURCE_ORDER: CatalogueSource[] = ['base', 'delve', 'yrt'];

// Nature display order
const NATURE_ORDER: FoeNature[] = [
	'Ironlander',
	'Firstborn',
	'Animal',
	'Beast',
	'Horror',
	'Anomaly',
	'Construct',
];

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/**
 * Fetch foe catalogue from /api/catalogue/foes and cache it for the session.
 * Idempotent — safe to call multiple times; only fetches once.
 */
export async function loadFoes(): Promise<void> {
	if (_loaded || _loading) return;
	_loading = true;
	try {
		const res = await fetch('/api/catalogue/foes', { cache: 'reload' });
		if (!res.ok) throw new Error(`Foe fetch failed: ${res.status}`);
		const json = (await res.json()) as { foes: FoeDef[]; overrides?: FoeOverridesFile[] };
		_foes = json.foes.sort((a, b) => a.name.localeCompare(b.name));
		_overrides = json.overrides ?? [];
		_loaded = true;
	} catch (err) {
		console.error('[foeStore] Failed to load foes:', err);
	} finally {
		_loading = false;
	}
}

// ---------------------------------------------------------------------------
// Accessors (reactive — reads tracked by $derived)
// ---------------------------------------------------------------------------

/** All loaded foe definitions (unfiltered — for render-time resolution). */
export function getFoes(): FoeDef[] {
	return _foes;
}

/**
 * Foes whose source is currently enabled AND that aren't marked absent by
 * any active expansion override. Used by pickers; find* lookups stay
 * unfiltered so existing FoeEncounter records always resolve.
 */
export function getVisibleFoes(): FoeDef[] {
	return _foes.filter((f) => {
		if (!isSourceEnabled(foeSource(f))) return false;
		// Any active expansion can veto presence by marking present: false.
		for (const file of _overrides) {
			if (!isSourceEnabled(file.source)) continue;
			if (file.overrides[f.id]?.present === false) return false;
		}
		return true;
	});
}

/** Distinct nature values in canonical display order. */
export function getFoeNatures(): FoeNature[] {
	const present = new Set(_foes.map((f) => f.nature));
	return NATURE_ORDER.filter((n) => present.has(n));
}

/** Distinct source tags present in the catalogue, in canonical display order. */
export function getFoeSources(): CatalogueSource[] {
	const present = new Set(_foes.map((f) => foeSource(f)));
	return SOURCE_ORDER.filter((s) => present.has(s));
}

/** Visible sources after expansion filtering. */
export function getVisibleFoeSources(): CatalogueSource[] {
	return getFoeSources().filter((s) => isSourceEnabled(s));
}

/** Look up a single foe definition by id. Never filtered. */
export function findFoe(id: string): FoeDef | undefined {
	return _foes.find((f) => f.id === id);
}

/**
 * Return the foe's base description plus any addenda contributed by
 * currently-enabled expansion overrides, separated by blank lines.
 * Used when rendering FoeCard and the FoePickerDialog confirm view.
 */
export function resolveFoeDescription(foe: FoeDef): string {
	const parts: string[] = [];
	if (foe.description) parts.push(foe.description);
	for (const file of _overrides) {
		if (!isSourceEnabled(file.source)) continue;
		const add = file.overrides[foe.id]?.addendum;
		if (add) parts.push(add);
	}
	return parts.join('\n\n');
}

/** Case-insensitive lookup by name. Never filtered. */
export function findFoeByName(name: string): FoeDef | undefined {
	const lower = name.toLowerCase();
	return _foes.find((f) => f.name.toLowerCase() === lower);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Canonical source tag for a foe. Reads the explicit `source` field first,
 * falling back to id-prefix derivation for un-migrated entries.
 */
export function foeSource(foe: FoeDef): CatalogueSource {
	if (foe.source) return foe.source;
	if (foe.id.startsWith('ironsworn/')) return 'base';
	if (foe.id.startsWith('delve/')) return 'delve';
	if (foe.id.startsWith('yrt/')) return 'yrt';
	return 'base';
}

/**
 * Compute the effective rank after applying a quantity rank adjustment,
 * clamped to [1, 5].
 */
export function effectiveRank(baseRank: number, rankAdj: number): number {
	return Math.min(5, Math.max(1, baseRank + rankAdj));
}
