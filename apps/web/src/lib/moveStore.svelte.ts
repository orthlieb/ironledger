// =============================================================================
// Iron Ledger — Move Store (Svelte 5 module-level $state)
//
// Provides:
//   • loadMoves()                — fetch + cache move catalogue
//   • getMoves()                 — full sorted list (unfiltered, reactive)
//   • getVisibleMoves()          — moves filtered by enabled expansions
//   • getMoveCategories()        — distinct category names in display order
//   • getVisibleMoveCategories() — categories after expansion filtering
//   • findMove(id)               — lookup by id (never filtered)
//   • isProgressMove(m)          — true if move rolls against a progress track
//   • isNoRollMove(m)            — true if move has no roll (informational only)
//   • hasRollableStats(m)        — true if move has stats to roll (standard action move)
// =============================================================================

import type { MoveDefinition } from '@ironledger/shared';
import { isSourceEnabled, loadExtensions } from './expansionStore.svelte.js';
import { moveCategoryOrder } from './extensionCategories.svelte.js';

/** One expansion's patches against base moves. Mirrors the foe override file. */
export interface MoveOverride {
	/** `false` hides the base move while this expansion is enabled (used to
	 *  replace a base move with an extension's alternate — "hide + add"). */
	present?: boolean;
}
export interface MoveOverridesFile {
	/** Expansion id — the override applies only while this source is enabled. */
	source: string;
	/** Keyed by base move id (e.g. `move/end-the-fight`). */
	overrides: Record<string, MoveOverride>;
}

// ---------------------------------------------------------------------------
// Module-level state
//
// Category display order is manifest-driven — each extension declares its
// own move categories (with per-category icon, tint, and sort slot) in its
// `extension.json`. moveCategoryOrder() merges them across enabled
// extensions. Categories with no visible moves are simply skipped by
// categoriesFromList(); unknown categories sort after all declared ones.
// ---------------------------------------------------------------------------

let _moves: MoveDefinition[] = $state([]);
let _overrides: MoveOverridesFile[] = $state([]);
let _loading = $state(false);
let _loaded = false;

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
		// Await loadExtensions alongside the fetch so moveCategoryOrder() can
		// resolve against a populated registry — otherwise the first render
		// falls back to alphabetical (empty-registry → Infinity for every key).
		const [res] = await Promise.all([
			fetch('/api/catalogue/moves', { cache: 'no-store' }),
			loadExtensions(),
		]);
		if (!res.ok) throw new Error(`Moves fetch failed: ${res.status}`);
		const json = (await res.json()) as {
			moves: MoveDefinition[];
			overrides?: MoveOverridesFile[];
		};

		// Sort by category order (from the extension manifest), then
		// alphabetically within category. Unknown categories sort after all
		// declared ones.
		const order = moveCategoryOrder();
		const idx = new Map(order.map((k, i) => [k, i]));
		const catIdx = (cat: string) => idx.get(cat) ?? order.length;
		json.moves.sort((a, b) => {
			const ci = catIdx(a.category) - catIdx(b.category);
			if (ci !== 0) return ci;
			return a.name.localeCompare(b.name);
		});

		_moves = json.moves;
		_overrides = json.overrides ?? [];
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

/** All moves, sorted by category then name (unfiltered — for render-time resolution). */
export function getMoves(): MoveDefinition[] {
	return _moves;
}

/**
 * Moves whose source is currently enabled AND that aren't hidden by an active
 * expansion override. An extension replaces a base move by shipping its own
 * move plus a `moves/overrides.json` that marks the base id `present: false`
 * ("hide + add"). Mirrors `foeStore.getVisibleFoes`. `findMove` stays
 * unfiltered so saved log links to a hidden move still resolve.
 */
export function getVisibleMoves(): MoveDefinition[] {
	return _moves.filter((m) => {
		if (!isSourceEnabled(m.source)) return false;
		for (const file of _overrides) {
			if (!isSourceEnabled(file.source)) continue;
			if (file.overrides[m.id]?.present === false) return false;
		}
		return true;
	});
}

/** Distinct categories in display order (across the full catalogue). */
export function getMoveCategories(): string[] {
	return categoriesFromList(_moves);
}

/** Visible categories after expansion filtering. */
export function getVisibleMoveCategories(): string[] {
	return categoriesFromList(getVisibleMoves());
}

function categoriesFromList(moves: MoveDefinition[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	// Manifest-declared categories first, in their declared order.
	for (const cat of moveCategoryOrder()) {
		if (moves.some((m) => m.category === cat) && !seen.has(cat)) {
			seen.add(cat);
			result.push(cat);
		}
	}
	// Any move-category strings not declared by any extension trail behind
	// (defensive — real content should always be declared).
	for (const m of moves) {
		if (!seen.has(m.category)) {
			seen.add(m.category);
			result.push(m.category);
		}
	}
	return result;
}

/** Find a move by ID. Never filtered. */
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

/** Spell roll moves use 1d6 + adds vs (difficulty + 1d10). */
export function isSpellRollMove(m: MoveDefinition): boolean {
	return !!(m as Record<string, unknown>)['spellRoll'];
}

/** Table-roll moves roll d100 against an inline table (no action die or challenge dice). */
export function isTableRollMove(m: MoveDefinition): boolean {
	return !!(m as Record<string, unknown>)['tableRoll'];
}

/** No-roll moves are informational — no stats and no/empty outcomes. */
export function isNoRollMove(m: MoveDefinition): boolean {
	if (isProgressMove(m)) return false;
	if (isSpellRollMove(m)) return false;
	if (isTableRollMove(m)) return false;
	if (m.stats && m.stats.length > 0) return false;
	return true;
}

/** Standard action moves have stats to pick and roll 1d6 + stat + adds vs 2d10. */
export function hasRollableStats(m: MoveDefinition): boolean {
	return !!m.stats && m.stats.length > 0 && !isProgressMove(m);
}
