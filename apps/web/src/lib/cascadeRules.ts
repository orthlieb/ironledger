// =============================================================================
// Iron Ledger — Cascade Rules
// Defines automatic secondary effects triggered by resource/debility changes.
//
// Rule categories:
//   OVERFLOW_RULES         — checked in LogPanel (resource-link click handler):
//                            resource drops below 0, excess converts to another
//                            resource via a clickable log entry.
//   FLOOR_RULES            — checked in CharacterSheet.applyResourceChange:
//                            resource lands at its minimum, appends a plain note.
//   DEBILITY_MOMENTUM_*    — checked in CharacterSheet.applyDebilityToggle:
//                            marking a debility reduces maxMomentum by 1; if
//                            current momentum exceeds the new cap, it is reduced.
// =============================================================================

// ---------------------------------------------------------------------------
// Overflow Rules  (LogPanel — resource-link click handler)
// ---------------------------------------------------------------------------

export interface OverflowRule {
	resource:   string;   // which resource triggers the overflow ('health' | 'spirit')
	overflowTo: string;   // where excess damage flows ('momentum')
	logTitle:   string;
	logHtml: (ctx: { overflow: number; charId: string; entryId: string }) => string;
}

export const OVERFLOW_RULES: OverflowRule[] = [
	{
		resource:   'health',
		overflowTo: 'momentum',
		logTitle:   'Health: Zero',
		logHtml: ({ overflow, charId, entryId }) =>
			`<p>Your health is zero. You also lose ` +
			`<a class="resource-link" data-resource="momentum" data-value="-${overflow}" ` +
			`data-entry-id="${entryId}" data-char-id="${charId}">-${overflow} momentum</a>.</p>`,
	},
	{
		resource:   'spirit',
		overflowTo: 'momentum',
		logTitle:   'Spirit: Zero',
		logHtml: ({ overflow, charId, entryId }) =>
			`<p>Your spirit is zero. You also lose ` +
			`<a class="resource-link" data-resource="momentum" data-value="-${overflow}" ` +
			`data-entry-id="${entryId}" data-char-id="${charId}">-${overflow} momentum</a>.</p>`,
	},
];

// ---------------------------------------------------------------------------
// Floor Rules  (CharacterSheet — applyResourceChange)
// Fires when a resource transitions INTO its minimum this change (delta < 0).
// Only appends a note — no state change (clamping is already done).
// ---------------------------------------------------------------------------

export interface FloorRule {
	resource: string;   // 'momentum' | 'supply'
	floor:    number;   //  -6        |  0
	logTitle: string;
	logHtml:  string;   // static HTML (no dynamic values needed)
}

export const FLOOR_RULES: FloorRule[] = [
	{
		resource: 'momentum',
		floor:    -6,
		logTitle: 'Momentum: Desperate',
		logHtml:  '<p>Your momentum is at its minimum of \u22126. You face a desperate situation.</p>',
	},
	{
		resource: 'supply',
		floor:    0,
		logTitle: 'Supply: Exhausted',
		logHtml:
			'<p>Your supply is exhausted. Make a move to ' +
			'<a class="move-link" data-id="move/resupply">Resupply</a> or ' +
			'<a class="move-link" data-id="move/sojourn">Sojourn</a> to recover.</p>',
	},
];

// ---------------------------------------------------------------------------
// Debility Cascade  (CharacterSheet — applyDebilityToggle)
// When a debility is marked, maxMomentum drops by 1. If current momentum
// exceeds the new cap, a clickable log entry is appended — the player must
// click the resource-link to apply the reduction (consistent with all other
// resource changes in the app). The log HTML is built inline in CharacterSheet
// since it requires runtime values (character.id, crypto.randomUUID()).
// ---------------------------------------------------------------------------

export const DEBILITY_MOMENTUM_TITLE = 'Momentum: Reduced';
export const BURN_MOMENTUM_TITLE     = 'Momentum: Burn Available';
