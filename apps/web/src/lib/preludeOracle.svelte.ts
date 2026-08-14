// =============================================================================
// Iron Ledger — Prelude Event oracle (resolver oracle → asset)
//
// A d100 asset roll-table (Lodestar's Prelude Event) that, unlike the Encounter
// Index, has no roll ceremony: firing it picks a random asset + its prelude
// narrative, logs the result, and hands off to the character's asset-detail
// dialog (which shows the narrative on top) via a small reactive bus. Both
// entry points — the asset picker's d6 button and the Ask/Oracles tile — call
// `firePreludeOracle()`; CharactersArea consumes `preludeBus.request`.
// =============================================================================

import { getVisibleRollTables, rollOnTable } from './rollTableStore.svelte.js';
import { findAsset } from './assetStore.svelte.js';
import { appendLog } from './log.svelte.js';

// ── Bus ──────────────────────────────────────────────────────────────────────
// A request to open the asset-detail (add) dialog for the active character,
// seeded with a prelude narrative. Nonce lets the consumer react to repeat
// rolls of the same asset.
let _request = $state<{ assetId: string; text: string; nonce: number } | null>(null);
let _nonce = 0;

export const preludeBus = {
	get request() {
		return _request;
	},
};

/** Ask the active character's sheet to open the asset-detail dialog for
 *  `assetId`, showing `text` as the prelude banner. */
export function requestPreludeAsset(assetId: string, text: string): void {
	_nonce += 1;
	_request = { assetId, text, nonce: _nonce };
}

/** The first enabled asset roll-table (Prelude Event). */
export function getPreludeTable() {
	return getVisibleRollTables().find((t) => t.kind === 'asset');
}

/**
 * Roll the Prelude Event table, log the result, and dispatch the resolved asset
 * + narrative onto the bus. Pass `preRoll` (1–100) to resolve a value already
 * rolled elsewhere (e.g. after the table dialog's dice animation); omit it to
 * roll fresh (the asset picker's instant d6 button). Returns false when there's
 * no enabled asset table, the roll hits a gap, or the ref doesn't resolve.
 */
export function firePreludeOracle(preRoll?: number): boolean {
	const table = getPreludeTable();
	if (!table) return false;
	const { roll, entry } = rollOnTable(table, preRoll);
	if (!entry) return false;

	const def = findAsset(entry.ref);
	const name = def?.name ?? entry.ref;
	const cat = entry.category ? `${entry.category}: ` : '';
	appendLog(
		`Oracle ${table.name}`,
		`<div>Rolled d100: <strong>${roll}</strong> → ${cat}<strong>${name}</strong></div>`,
	);

	if (!def) return false;
	requestPreludeAsset(def.id, entry.text ?? '');
	return true;
}
