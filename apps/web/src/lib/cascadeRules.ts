// =============================================================================
// Iron Ledger — Cascade Rules
// Defines automatic secondary effects triggered by resource/debility changes.
//
// Rule categories:
//   OVERFLOW_RULES         — checked in LogPanel (resource-link click handler):
//                            resource drops below 0, excess converts to another
//                            resource via a clickable log entry.
//   FLOOR_RULES            — checked in CharacterSheet.applyResourceChange:
//                            resource lands at its minimum, appends a note with
//                            optional debility-link (supply → mark Unprepared).
//   FLOOR_OVERFLOW_RULES   — checked in LogPanel (resource-link click handler):
//                            resource is already at its minimum and additional
//                            reduction is attempted; appends a cascade entry so
//                            the player can resolve Face a Setback, Face Death,
//                            Face Desolation, or Out of Supply as appropriate.
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
// logHtml is a function so dynamic values (charId, entryId) can be embedded.
// ---------------------------------------------------------------------------

export interface FloorRule {
	resource: string;   // 'momentum' | 'supply'
	floor:    number;   //  -6        |  0
	logTitle: string;
	logHtml: (ctx: { charId: string; entryId: string }) => string;
}

export const FLOOR_RULES: FloorRule[] = [
	{
		resource: 'momentum',
		floor:    -6,
		logTitle: 'Momentum: Desperate',
		logHtml:  () => '<p>Your momentum is at its minimum of \u22126. You face a desperate situation.</p>',
	},
	{
		resource: 'supply',
		floor:    0,
		logTitle: 'Supply: Exhausted',
		logHtml:  ({ charId, entryId }) =>
			`<p>Your supply is exhausted. Mark ` +
			`<a class="debility-link" data-debility="unprepared" data-value="1" ` +
			`data-entry-id="${entryId}" data-char-id="${charId}">Unprepared</a>. ` +
			`Make a move to ` +
			`<a class="move-link" data-id="move/resupply">Resupply</a> or ` +
			`<a class="move-link" data-id="move/sojourn">Sojourn</a> to recover.</p>`,
	},
];

// ---------------------------------------------------------------------------
// Floor Overflow Rules  (LogPanel — resource-link click handler)
// Fires when a resource is ALREADY at its minimum (currentVal <= floor) and
// additional reduction is attempted (value < 0). Appends a cascade entry with
// per-point clickable resource-links or a move-link for the player to resolve.
// ---------------------------------------------------------------------------

export interface FloorOverflowRule {
	resource: string;   // 'momentum' | 'health' | 'spirit' | 'supply'
	floor:    number;   //  -6        |  0       |  0       |  0
	logTitle: string;
	logHtml: (ctx: { overflow: number; charId: string; entryId: string }) => string;
}

/** Build N rows of exchange resource-links (one row per overflow point). */
function makeOverflowRows(
	overflow: number,
	stats: Array<{ resource: string; label: string }>,
	charId: string,
	entryId: string,
): string {
	const rows = Array.from({ length: overflow }, () =>
		`<li>` +
		stats.map(s =>
			`<a class="resource-link" data-resource="${s.resource}" data-value="-1" ` +
			`data-entry-id="${entryId}" data-char-id="${charId}">\u22121\u00a0${s.label}</a>`,
		).join(' / ') +
		`</li>`,
	).join('');
	return `<ul>${rows}</ul>`;
}

export const FLOOR_OVERFLOW_RULES: FloorOverflowRule[] = [
	{
		resource: 'momentum',
		floor:    -6,
		logTitle: 'Face a Setback',
		logHtml: ({ overflow, charId, entryId }) =>
			`<p>Your momentum is at its minimum of \u22126. Distribute ${overflow} overflow ` +
			`\u2014 choose one per point:</p>` +
			makeOverflowRows(overflow, [
				{ resource: 'health', label: 'health' },
				{ resource: 'spirit', label: 'spirit' },
				{ resource: 'supply', label: 'supply' },
			], charId, entryId) +
			`<p>Or <a class="move-link" data-id="move/face-a-setback">Face a Setback</a> ` +
			`to lose progress on a track instead.</p>`,
	},
	{
		resource: 'health',
		floor:    0,
		logTitle: 'Face Death',
		logHtml: () =>
			`<p>Your health is at zero and you suffer further harm. You must ` +
			`<a class="move-link" data-id="move/face-death">Face Death</a> ` +
			`and roll +heart.</p>`,
	},
	{
		resource: 'spirit',
		floor:    0,
		logTitle: 'Face Desolation',
		logHtml: () =>
			`<p>Your spirit is at zero and you suffer further stress. You must ` +
			`<a class="move-link" data-id="move/face-desolation">Face Desolation</a> ` +
			`and roll +heart.</p>`,
	},
	{
		resource: 'supply',
		floor:    0,
		logTitle: 'Out of Supply',
		logHtml: ({ overflow, charId, entryId }) =>
			`<p>Your supply is exhausted. Exchange ${overflow} overflow ` +
			`\u2014 choose one per point:</p>` +
			makeOverflowRows(overflow, [
				{ resource: 'health',   label: 'health'   },
				{ resource: 'spirit',   label: 'spirit'   },
				{ resource: 'momentum', label: 'momentum' },
			], charId, entryId),
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
