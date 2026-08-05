// =============================================================================
// Iron Ledger — Roll-Table Store (Svelte 5 module-level $state)
//
// Resolver oracles: a d100 table where each range maps to a catalogue entity
// id (a foe id for kind 'foe', an asset id for kind 'asset'). This store just
// loads/filters the tables and rolls on them; resolving a ref to an actual
// foe/asset (and the detail + add UI) lives at the call sites, which already
// have findFoe / findAsset.
//
// Provides:
//   • loadRollTables()          — fetch + cache the catalogue
//   • getRollTables()           — full list (unfiltered)
//   • getVisibleRollTables()    — tables whose source expansion is enabled
//   • findRollTable(id)         — lookup by id (never filtered)
//   • rollOnTable(table, roll?) — resolve a d100 roll to its entry (+ the roll)
// =============================================================================

import type { RollTable, RollTableEntry } from '@ironledger/shared';
import { isSourceEnabled } from './expansionStore.svelte.js';

let _tables: RollTable[] = $state([]);
let _loading = $state(false);
let _loaded = false;

/**
 * Fetch the roll-table catalogue from /api/catalogue/roll-tables and cache for
 * the session. Idempotent — safe to call multiple times; only fetches once.
 */
export async function loadRollTables(): Promise<void> {
	if (_loaded || _loading) return;
	_loading = true;
	try {
		const res = await fetch('/api/catalogue/roll-tables', { cache: 'no-store' });
		if (!res.ok) throw new Error(`Roll-tables fetch failed: ${res.status}`);
		const json = (await res.json()) as { tables: RollTable[] };
		_tables = json.tables ?? [];
		_loaded = true;
	} catch (err) {
		console.error('[rollTableStore]', err);
	} finally {
		_loading = false;
	}
}

/** All roll-tables (unfiltered — for render-time resolution). */
export function getRollTables(): RollTable[] {
	return _tables;
}

/** Roll-tables whose source expansion is currently enabled. */
export function getVisibleRollTables(): RollTable[] {
	return _tables.filter((t) => isSourceEnabled(t.source));
}

/** Look up a roll-table by id. Never filtered. */
export function findRollTable(id: string): RollTable | undefined {
	return _tables.find((t) => t.id === id);
}

/**
 * Roll a d100 (or use the supplied `roll`, 1–100) against a table and return
 * the matching entry plus the roll value. Returns `entry: null` if no range
 * covers the roll (a data gap — the table should cover 1–100).
 */
export function rollOnTable(
	table: RollTable,
	roll?: number,
): { roll: number; entry: RollTableEntry | null } {
	const r = roll ?? Math.floor(Math.random() * 100) + 1;
	const entry = table.entries.find((e) => r >= e.low && r <= e.high) ?? null;
	return { roll: r, entry };
}
