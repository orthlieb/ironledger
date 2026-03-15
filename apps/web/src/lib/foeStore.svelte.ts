// =============================================================================
// Iron Ledger — Foe Store (Svelte 5 module-level $state)
//
// Provides:
//   • loadFoes()              — fetch + cache foe catalogue (idempotent)
//   • getFoes()               — full list of FoeDef (reactive)
//   • getFoeNatures()         — distinct nature values in display order
//   • getFoeSources()         — distinct source strings ('Ironsworn'|'Delve'|'Yrt')
//   • findFoe(id)             — lookup by id
//
// Constants re-exported for use in components:
//   • FOE_RANKS               — rank label + mechanics
//   • FOE_QUANTITIES          — quantity options with rank adjustments
//   • FOE_NATURE_COLORS       — nature → CSS hex colour
// =============================================================================

import type { FoeDef, FoeNature } from '$lib/types.js';

// ---------------------------------------------------------------------------
// Module-level state (shared across all component instances)
// ---------------------------------------------------------------------------

let _foes:    FoeDef[] = $state([]);
let _loading           = $state(false);
let _loaded            = false;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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
const SOURCE_ORDER = ['Ironsworn', 'Delve', 'Yrt'];

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
		_foes   = json.foes;
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

/** All loaded foe definitions. */
export function getFoes(): FoeDef[] {
	return _foes;
}

/** Distinct nature values in canonical display order. */
export function getFoeNatures(): FoeNature[] {
	const present = new Set(_foes.map((f) => f.nature));
	return NATURE_ORDER.filter((n) => present.has(n));
}

/**
 * Distinct source strings in canonical display order.
 * Derived from the id prefix: "ironsworn/*" → "Ironsworn", etc.
 */
export function getFoeSources(): string[] {
	const present = new Set(_foes.map((f) => foeSource(f)));
	return SOURCE_ORDER.filter((s) => present.has(s));
}

/** Look up a single foe definition by id. */
export function findFoe(id: string): FoeDef | undefined {
	return _foes.find((f) => f.id === id);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive a human-readable source label from a foe's id prefix. */
export function foeSource(foe: FoeDef): string {
	if (foe.id.startsWith('ironsworn/')) return 'Ironsworn';
	if (foe.id.startsWith('delve/'))     return 'Delve';
	if (foe.id.startsWith('yrt/'))       return 'Yrt';
	return 'Other';
}

/**
 * Compute the effective rank after applying a quantity rank adjustment,
 * clamped to [1, 5].
 */
export function effectiveRank(baseRank: number, rankAdj: number): number {
	return Math.min(5, Math.max(1, baseRank + rankAdj));
}
