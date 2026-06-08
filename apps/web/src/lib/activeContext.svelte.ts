// =============================================================================
// Iron Ledger — Active Context (v2)
//
// Module-level $state for the "currently active" foe and expedition IDs.
// FoesArea / ExpeditionsArea publish their spine selection here so any
// downstream consumer (MovesDialog precondition context, log entries,
// future per-area shortcuts) can read live values without prop drilling.
//
// The active character lives in diceContext.svelte.ts — kept separate
// because it carries a live data reference, not just an id.
// =============================================================================

let _activeFoeId = $state<string>('');
let _activeExpeditionId = $state<string>('');

export function getActiveFoeId(): string {
	return _activeFoeId;
}
export function getActiveExpeditionId(): string {
	return _activeExpeditionId;
}

export function setActiveFoeId(id: string): void {
	_activeFoeId = id;
}
export function setActiveExpeditionId(id: string): void {
	_activeExpeditionId = id;
}
