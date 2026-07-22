// =============================================================================
// Iron Ledger — Campaign map state (Svelte 5 module-level $state)
//
// One map per user, painted onto a 20×15 pointy-top hex grid. Data is a
// sparse array of {q, r, terrain} — unpainted cells simply aren't in the
// list, keeping the payload tiny for even a fully-explored map (~5 KB).
//
// Persisted to localStorage['ironledger:map'] on every mutation. No debounce
// yet — painting is a discrete click, not a drag stream, so per-click
// writes are cheap and worst-case (paint every cell) is <1 KB. If we add
// drag-paint later, the write path should debounce.
//
// Reactive readers use the fine-grained proxy tracking Svelte 5 exposes:
// components read `mapState.cells` inside `$derived` and re-render only
// when the array actually mutates.
// =============================================================================

import type { Terrain } from './mapConstants.js';

const STORAGE_KEY = 'ironledger:map';

export interface HexCell {
	q: number;
	r: number;
	terrain: Terrain;
}

interface MapPayload {
	cells: HexCell[];
	updatedAt: number;
}

function readMap(): MapPayload {
	if (typeof window === 'undefined') return { cells: [], updatedAt: 0 };
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { cells: [], updatedAt: 0 };
		const p = JSON.parse(raw) as Partial<MapPayload>;
		return {
			cells: Array.isArray(p.cells) ? (p.cells as HexCell[]) : [],
			updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : 0,
		};
	} catch {
		return { cells: [], updatedAt: 0 };
	}
}

function persist(): void {
	if (typeof window === 'undefined') return;
	localStorage.setItem(
		STORAGE_KEY,
		JSON.stringify({ cells: mapState.cells, updatedAt: Date.now() }),
	);
}

const _initial = readMap();
export const mapState = $state<MapPayload>({
	cells: _initial.cells,
	updatedAt: _initial.updatedAt,
});

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

/** Terrain at (q, r), or null if the cell is unpainted. Linear scan is
 *  intentional — 250 cells × 250 render iterations is <1 ms on desktop and
 *  keeps the mutation path simple. Swap for a Map lookup if perf bites. */
export function terrainAt(q: number, r: number): Terrain | null {
	const c = mapState.cells.find((cell) => cell.q === q && cell.r === r);
	return c?.terrain ?? null;
}

/** True when any cell has been painted — used to gate the "Clear" button. */
export function hasAnyCells(): boolean {
	return mapState.cells.length > 0;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Paint (or erase) a hex. Passing `null` for terrain removes the cell from
 * the sparse array — matching the "erase back to unpainted" semantics the
 * eraser tool needs. In-place updates keep the store array's identity
 * stable so Svelte's proxy tracking triggers component-scoped re-renders
 * rather than a full remount.
 */
export function paintHex(q: number, r: number, terrain: Terrain | null): void {
	const idx = mapState.cells.findIndex((c) => c.q === q && c.r === r);
	if (terrain === null) {
		if (idx >= 0) mapState.cells.splice(idx, 1);
	} else if (idx >= 0) {
		mapState.cells[idx] = { q, r, terrain };
	} else {
		mapState.cells.push({ q, r, terrain });
	}
	persist();
}

/** Wipe the map. Callers should confirm with the user first — this is the
 *  only destructive operation in the store. */
export function clearMap(): void {
	mapState.cells = [];
	persist();
}
