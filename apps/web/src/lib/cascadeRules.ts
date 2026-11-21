// =============================================================================
// Iron Ledger — Cascade Rules
// Defines automatic secondary effects triggered by resource/debility changes.
//
// Each rule's log HTML holds command links bound to the character
// (#lib/commands/links.ts); the caller binds them to the entry. The command
// runner checks these on every change to a character's value
// (#lib/commands/run.svelte.ts → cascade).
//
// Rule categories:
//   OVERFLOW_RULES         — a decrease past 0:
//                            resource drops below 0, excess converts to another
//                            resource via a clickable log entry.
//   FLOOR_RULES            — a decrease that lands on the floor:
//                            resource lands at its minimum, appends a note with
//                            optional command link (supply → /unprepared++).
//   FLOOR_OVERFLOW_RULES   — a decrease of a value already at its floor:
//                            resource is already at its minimum and additional
//                            reduction is attempted; appends a cascade entry so
//                            the player can resolve Face a Setback, Face Death,
//                            Face Desolation, or Out of Supply as appropriate.
//   DEBILITY_MOMENTUM_*    — checked in CharacterSheet.applyDebilityToggle:
//                            marking a debility reduces maxMomentum by 1; if
//                            current momentum exceeds the new cap, it is reduced.
// =============================================================================

import { commandLinkHtml } from './commands/links.js';
import { escHtml } from './markdown.js';

/** A command link for the character a cascade is about. */
const link = (label: string, cmd: string, charId: string) =>
	commandLinkHtml(label, cmd, { charId });

// ---------------------------------------------------------------------------
// Overflow Rules
// ---------------------------------------------------------------------------

export interface OverflowRule {
	resource: string; // which resource triggers the overflow ('health' | 'spirit')
	overflowTo: string; // where excess damage flows ('momentum')
	logTitle: string;
	logHtml: (ctx: { overflow: number; charId: string }) => string;
}

export const OVERFLOW_RULES: OverflowRule[] = [
	{
		resource: 'health',
		overflowTo: 'momentum',
		logTitle: 'Health: Zero',
		logHtml: ({ overflow, charId }) =>
			`<p>Your health is zero. You also lose ` +
			link(`-${overflow} momentum`, `/momentum-=${overflow}`, charId) +
			`.</p>`,
	},
	{
		resource: 'spirit',
		overflowTo: 'momentum',
		logTitle: 'Spirit: Zero',
		logHtml: ({ overflow, charId }) =>
			`<p>Your spirit is zero. You also lose ` +
			link(`-${overflow} momentum`, `/momentum-=${overflow}`, charId) +
			`.</p>`,
	},
];

/**
 * A companion's health taken past 0 (Companion Endure Harm: "If your
 * companion's health is 0, exchange any leftover −health for −momentum"):
 * the rest comes off the character's momentum, as a link to click, like
 * the character's own health. The runner checks it on every change to a
 * companion's health, typed or clicked (`/Ash.health-=harm`).
 */
export const COMPANION_HEALTH_OVERFLOW = {
	logTitle: 'Companion Health: Zero',
	logHtml: ({ overflow, charId, name }: { overflow: number; charId: string; name: string }) =>
		`<p>${escHtml(name)}’s health is zero. You lose ` +
		link(`-${overflow} momentum`, `/momentum-=${overflow}`, charId) +
		` instead.</p>`,
};

// ---------------------------------------------------------------------------
// Floor Rules  (CharacterSheet — applyResourceChange)
// Fires when a resource transitions INTO its minimum this change (delta < 0).
// Only appends a note — no state change (clamping is already done).
// logHtml is a function so dynamic values (charId, entryId) can be embedded.
// ---------------------------------------------------------------------------

export interface FloorRule {
	resource: string; // 'momentum' | 'supply'
	floor: number; //  -6        |  0
	logTitle: string;
	logHtml: (ctx: { charId: string }) => string;
}

export const FLOOR_RULES: FloorRule[] = [
	{
		resource: 'momentum',
		floor: -6,
		logTitle: 'Momentum: Desperate',
		logHtml: () =>
			'<p>Your momentum is at its minimum of \u22126. You face a desperate situation.</p>',
	},
	{
		resource: 'supply',
		floor: 0,
		logTitle: 'Supply: Exhausted',
		logHtml: ({ charId }) =>
			`<p>Your supply is exhausted. Mark ` +
			link('Unprepared', '/unprepared++', charId) +
			`. Make a move to ` +
			link('Resupply', '/move resupply', charId) +
			` or ` +
			link('Sojourn', '/move sojourn', charId) +
			` to recover.</p>`,
	},
];

// ---------------------------------------------------------------------------
// Floor Overflow Rules  (a command link's click, or a change on the sheet)
// Fires when a resource is ALREADY at its minimum (currentVal <= floor) and
// additional reduction is attempted (value < 0). Appends a cascade entry with
// per-point command links or a /move link for the player to resolve.
// ---------------------------------------------------------------------------

export interface FloorOverflowRule {
	resource: string; // 'momentum' | 'health' | 'spirit' | 'supply'
	floor: number; //  -6        |  0       |  0       |  0
	logTitle: string;
	logHtml: (ctx: { overflow: number; charId: string }) => string;
}

/** Build N rows of exchange links (one row per overflow point). */
function makeOverflowRows(
	overflow: number,
	stats: Array<{ resource: string; label: string }>,
	charId: string,
): string {
	const rows = Array.from(
		{ length: overflow },
		() =>
			`<li>` +
			stats.map((s) => link(`\u22121\u00a0${s.label}`, `/${s.resource}--`, charId)).join(' / ') +
			`</li>`,
	).join('');
	return `<ul>${rows}</ul>`;
}

export const FLOOR_OVERFLOW_RULES: FloorOverflowRule[] = [
	{
		resource: 'momentum',
		floor: -6,
		logTitle: 'Face a Setback',
		logHtml: ({ overflow, charId }) =>
			`<p>Your momentum is at its minimum of \u22126. Distribute ${overflow} overflow ` +
			`\u2014 choose one per point:</p>` +
			makeOverflowRows(
				overflow,
				[
					{ resource: 'health', label: 'health' },
					{ resource: 'spirit', label: 'spirit' },
					{ resource: 'supply', label: 'supply' },
				],
				charId,
			) +
			`<p>Or ${link('Face a Setback', '/move face-a-setback', charId)} ` +
			`to lose progress on a track instead.</p>`,
	},
	{
		resource: 'health',
		floor: 0,
		logTitle: 'Face Death',
		logHtml: ({ charId }) =>
			`<p>Your health is at zero and you suffer further harm. You must ` +
			`${link('Face Death', '/move face-death', charId)} and roll +heart.</p>`,
	},
	{
		resource: 'spirit',
		floor: 0,
		logTitle: 'Face Desolation',
		logHtml: ({ charId }) =>
			`<p>Your spirit is at zero and you suffer further stress. You must ` +
			`${link('Face Desolation', '/move face-desolation', charId)} and roll +heart.</p>`,
	},
	{
		resource: 'supply',
		floor: 0,
		logTitle: 'Out of Supply',
		logHtml: ({ overflow, charId }) =>
			`<p>Your supply is exhausted. Exchange ${overflow} overflow ` +
			`\u2014 choose one per point:</p>` +
			makeOverflowRows(
				overflow,
				[
					{ resource: 'health', label: 'health' },
					{ resource: 'spirit', label: 'spirit' },
					{ resource: 'momentum', label: 'momentum' },
				],
				charId,
			),
	},
];

// ---------------------------------------------------------------------------
// Debility Cascade  (CharacterSheet — applyDebilityToggle)
// When a debility is marked, maxMomentum drops by 1. If current momentum
// exceeds the new cap, a clickable log entry is appended — the player must
// click its command link to apply the reduction (consistent with all other
// resource changes in the app). The log HTML is built inline in CharacterSheet
// since it requires runtime values (character.id, crypto.randomUUID()).
// ---------------------------------------------------------------------------

export const DEBILITY_MOMENTUM_TITLE = 'Momentum: Reduced';
export const BURN_MOMENTUM_TITLE = 'Momentum: Burn Available';
