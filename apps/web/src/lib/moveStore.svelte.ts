// =============================================================================
// Iron Ledger — Move Store (Svelte 5 module-level $state)
//
// Provides:
//   • loadMoves()          — fetch + cache move catalogue
//   • getMoves()           — sorted list of MoveDefinition (reactive)
//   • getMoveCategories()  — distinct category names in display order
//   • findMove(id)         — lookup by id
//   • isProgressMove(m)    — true if move rolls against a progress track
//   • isNoRollMove(m)      — true if move has no roll (informational only)
//   • hasRollableStats(m)  — true if move has stats to roll (standard action move)
// =============================================================================

import type { MoveDefinition } from '@ironledger/shared';
import type { Precondition } from './preconditions.js';

// ---------------------------------------------------------------------------
// Category display order
// ---------------------------------------------------------------------------

const CATEGORY_ORDER = [
	'Adventure', 'Relationship', 'Combat', 'Suffer',
	'Quest', 'Fate', 'Delve', 'Rarity', 'Failure', 'Yrt',
];

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let _moves:   MoveDefinition[] = $state([]);
let _loading                   = $state(false);
let _loaded                    = false;

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/**
 * Fetch move catalogue from /api/catalogue/moves and cache for the session.
 * Idempotent — safe to call multiple times; only fetches once.
 */
export async function loadMoves(): Promise<void> {
	if (_loaded || _loading) return;
	_loading = true;
	try {
		const res = await fetch('/api/catalogue/moves');
		if (!res.ok) throw new Error(`Moves fetch failed: ${res.status}`);
		const json = (await res.json()) as { moves: MoveDefinition[] };

		// Sort by category order, then alphabetically within category
		const catIdx = (cat: string) => {
			const i = CATEGORY_ORDER.indexOf(cat);
			return i >= 0 ? i : CATEGORY_ORDER.length;
		};
		json.moves.sort((a, b) => {
			const ci = catIdx(a.category) - catIdx(b.category);
			if (ci !== 0) return ci;
			return a.name.localeCompare(b.name);
		});

		_moves  = json.moves;
		_loaded = true;
	} catch (err) {
		console.error('[moveStore]', err);
	} finally {
		_loading = false;
	}
}

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

/** All moves, sorted by category then name. */
export function getMoves(): MoveDefinition[] {
	return _moves;
}

/** Distinct categories in display order. */
export function getMoveCategories(): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const cat of CATEGORY_ORDER) {
		if (_moves.some((m) => m.category === cat) && !seen.has(cat)) {
			seen.add(cat);
			result.push(cat);
		}
	}
	// Any categories not in CATEGORY_ORDER
	for (const m of _moves) {
		if (!seen.has(m.category)) {
			seen.add(m.category);
			result.push(m.category);
		}
	}
	return result;
}

/** Find a move by ID. */
export function findMove(id: string): MoveDefinition | undefined {
	return _moves.find((m) => m.id === id);
}

// ---------------------------------------------------------------------------
// Classification helpers
// ---------------------------------------------------------------------------

/** Progress moves roll 2d10 vs a progress score (no action die). */
export function isProgressMove(m: MoveDefinition): boolean {
	return !!(m as Record<string, unknown>).progressTrack;
}

/** No-roll moves are informational — no stats and no/empty outcomes. */
export function isNoRollMove(m: MoveDefinition): boolean {
	if (isProgressMove(m)) return false;
	if (m.stats && m.stats.length > 0) return false;
	return true;
}

/** Standard action moves have stats to pick and roll 1d6 + stat + adds vs 2d10. */
export function hasRollableStats(m: MoveDefinition): boolean {
	return !!m.stats && m.stats.length > 0 && !isProgressMove(m);
}
