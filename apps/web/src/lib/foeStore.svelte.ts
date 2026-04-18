// =============================================================================
// Iron Ledger — Foe Store (Svelte 5 module-level $state)
//
// Provides:
//   • loadFoes()              — fetch + cache foe catalogue (idempotent)
//   • getFoes()               — full list of FoeDef (reactive, unfiltered)
//   • getVisibleFoes()        — foes filtered by enabled expansions
//   • getFoeNatures()         — distinct nature values in display order
//   • getFoeSources()         — distinct source tags ('base'|'delve'|'yrt')
//   • getVisibleFoeSources()  — visible sources after filtering
//   • findFoe(id)             — lookup by id (never filtered)
//
// Constants re-exported for use in components:
//   • FOE_RANKS               — rank label + mechanics
//   • FOE_QUANTITIES          — quantity options with rank adjustments
//   • FOE_NATURE_COLORS       — nature → CSS hex colour
// =============================================================================

import type { FoeDef, FoeNature, CatalogueSource } from '$lib/types.js';
import { isSourceEnabled } from '$lib/expansionStore.svelte.js';

// ---------------------------------------------------------------------------
// Module-level state (shared across all component instances)
// ---------------------------------------------------------------------------

let _foes:    FoeDef[] = $state([]);
let _loading           = $state(false);
let _loaded            = false;

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
	2: { label: 'Dangerous',   progressPerHit: 8,  harm: 2 },
	3: { label: 'Formidable',  progressPerHit: 4,  harm: 3 },
	4: { label: 'Extreme',     progressPerHit: 2,  harm: 4 },
	5: { label: 'Epic',        progressPerHit: 1,  harm: 5 },
};

export const FOE_QUANTITIES: Array<{
	value: 'solo' | 'pack' | 'horde';
	label: string;
	rankAdj: number;
	desc: string;
}> = [
	{ value: 'solo',  label: 'Solo',       rankAdj: 0, desc: 'One foe'   },
	{ value: 'pack',  label: 'Pack (2–4)', rankAdj: 1, desc: '+1 rank'   },
	{ value: 'horde', label: 'Horde (5+)', rankAdj: 2, desc: '+2 ranks'  },
];

export const FOE_NATURE_COLORS: Record<FoeNature, string> = {
	Ironlander: '#9ca3af',
	Firstborn:  '#f59e0b',
	Animal:     '#34d399',
	Beast:      '#ef4444',
	Horror:     '#a855f7',
	Anomaly:    '#fb923c',
};

// Source order for display
const SOURCE_ORDER: CatalogueSource[] = ['base', 'delve', 'yrt'];

// Nature display order
const NATURE_ORDER: FoeNature[] = [
	'Ironlander', 'Firstborn', 'Animal', 'Beast', 'Horror', 'Anomaly',
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
		const res = await fetch('/api/catalogue/foes');
		if (!res.ok) throw new Error(`Foe fetch failed: ${res.status}`);
		const json = (await res.json()) as { foes: FoeDef[] };
		_foes   = json.foes.sort((a, b) => a.name.localeCompare(b.name));
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

/** Foes whose source is currently enabled. Used by pickers. */
export function getVisibleFoes(): FoeDef[] {
	return _foes.filter((f) => isSourceEnabled(foeSource(f)));
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
	if (foe.id.startsWith('delve/'))     return 'delve';
	if (foe.id.startsWith('yrt/'))       return 'yrt';
	return 'base';
}

/**
 * Compute the effective rank after applying a quantity rank adjustment,
 * clamped to [1, 5].
 */
export function effectiveRank(baseRank: number, rankAdj: number): number {
	return Math.min(5, Math.max(1, baseRank + rankAdj));
}
