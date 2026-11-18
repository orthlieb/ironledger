// =============================================================================
// Iron Ledger — a move roll's log text
//
// The pure half of MovesDialog's rolls: each roll's lines, the outcome's class
// and label, the move's outcome text with its harm links resolved, the log
// title, the burn-momentum offer and the Take a Hiatus body. MovesDialog rolls
// the dice, animates them and appends the log entry; everything here is text
// from numbers, so it's testable. LogPanel and DiceRollerDialog share the
// outcome class and label.
// =============================================================================

import { commandLinkHtml } from './commands/links.js';
import type { MoveDefinition } from '@ironledger/shared';
import { renderRich } from '#lib/dsl.js';
import { escHtml } from '#lib/markdown.js';
import { actionScoreHtml } from '#lib/rules/actionScore.js';

// ── Outcome ──────────────────────────────────────────────────────────────────

/** The log class for an outcome: a strong hit beats both challenge dice. */
export function outcomeClass(hits1: boolean, hits2: boolean): string {
	if (hits1 && hits2) return 'roll-outcome-strong';
	if (hits1 || hits2) return 'roll-outcome-weak';
	return 'roll-outcome-miss';
}

export function outcomeLabel(hits1: boolean, hits2: boolean): string {
	if (hits1 && hits2) return 'Strong Hit';
	if (hits1 || hits2) return 'Weak Hit';
	return 'Miss';
}

/** The outcome line: "Strong Hit", with "with a match!" on matching challenge dice. */
export function outcomeHeaderHtml(hits1: boolean, hits2: boolean, isMatch = false): string {
	const matchSpan = isMatch ? ' <span class="roll-match">with a match!</span>' : '';
	return (
		`<div class="${outcomeClass(hits1, hits2)}">` +
		`<strong>${outcomeLabel(hits1, hits2)}</strong>${matchSpan}` +
		`</div>`
	);
}

// ── Roll lines ───────────────────────────────────────────────────────────────

/** Adds as a roll-line term: " + adds[+2]", " + adds[−1]", or '' for none. */
function addsTerm(adds: number): string {
	return adds !== 0 ? ` + adds[${adds > 0 ? '+' : '−'}${Math.abs(adds)}]` : '';
}

/**
 * An action roll's lines: the momentum-cancel note when negative momentum
 * cancelled the action die, then "1d6 [4] + iron[2] + adds[+1] = 7 vs 2d10
 * [3] [9]". The score shows its cap when the raw total passed 10.
 */
export function actionRollHtml(r: {
	actionDie: number;
	cancelled: boolean;
	momentum: number;
	stat: string;
	statValue: number;
	adds: number;
	action: { score: number; raw: number };
	c1: number;
	c2: number;
}): string {
	const cancel = r.cancelled
		? `<div class="roll-cancel">Momentum cancel! Momentum is ${r.momentum}, ` +
			`action die ${r.actionDie} → 0.</div>`
		: '';
	const dieStr = r.cancelled ? `<s>${r.actionDie}</s>&thinsp;0` : `${r.actionDie}`;
	return (
		cancel +
		`<div class="roll-line">` +
		`1d6 [${dieStr}] + ${r.stat.toLowerCase()}[${r.statValue}]${addsTerm(r.adds)}` +
		` = ${actionScoreHtml(r.action)} vs 2d10 [${r.c1}] [${r.c2}]` +
		`</div>`
	);
}

/** A progress roll's line: "Progress [6] + Adds [+1] = [7] vs 2d10 [3] [9]". */
export function progressRollHtml(progress: number, adds: number, c1: number, c2: number): string {
	const addsStr =
		adds !== 0
			? ` + Adds [<strong>${adds > 0 ? '+' : '−'}${Math.abs(adds)}</strong>] = [<strong>${progress + adds}</strong>]`
			: '';
	return (
		`<div class="roll-line">` +
		`Progress [<strong>${progress}</strong>]${addsStr} vs 2d10 [${c1}] [${c2}]` +
		`</div>`
	);
}

/** A spell roll's line (Cast Conclave Ritual): "1d6 [4] + mana[2] = 6 vs
 *  difficulty[3] 1d10[7]". */
export function spellRollHtml(r: {
	actionDie: number;
	adds: number;
	mana: number;
	difficulty: number;
	c1: number;
}): string {
	const manaStr = r.mana > 0 ? ` + mana[${r.mana}]` : '';
	const total = r.actionDie + r.adds + r.mana;
	return (
		`<div class="roll-line">` +
		`1d6 [${r.actionDie}]${addsTerm(r.adds)}${manaStr}` +
		` = <strong>${total}</strong> vs difficulty[<strong>${r.difficulty}</strong>] 1d10[${r.c1}]` +
		`</div>`
	);
}

/** Ask the Oracle's lines: the d100, then Yes or No against the odds. */
export function askOracleHtml(roll: number, odds: string, threshold: number): string {
	const yes = roll >= threshold;
	return (
		`<div class="roll-line">1d100 [${roll}]</div>` +
		`<div class="${yes ? 'roll-outcome-strong' : 'roll-outcome-miss'}"><strong>${yes ? 'Yes' : 'No'}</strong> — ${odds} (≥${threshold})</div>`
	);
}

/** A table move's lines: the d100 as an oracle logs it, then the row. */
export function tableRollHtml(roll: number, rowHtml: string): string {
	return (
		`<div class="roll-line">Roll: d100 → ${roll}</div>` +
		`<div class="move-outcome">${rowHtml}</div>`
	);
}

/** The two d10 faces that show a d100 roll: tens, then ones (100 is 10 and 10). */
export function d100Faces(roll: number): [tens: number, ones: number] {
	return [Math.floor((roll % 100) / 10) || 10, roll % 10 || 10];
}

// ── The move's own text ──────────────────────────────────────────────────────

/** Move text renders through `renderRich` (markdown formatting + the
 *  `[label](scheme:args)` link DSL) before the harm/enrich passes; a move opts
 *  back out to raw HTML with `html: true`. */
export function moveMd(m: MoveDefinition | null, text: string | undefined): string {
	return (m as Record<string, unknown> | null)?.html ? (text ?? '') : renderRich(text);
}

/** The move's strong hit, weak hit or miss text, rendered. */
export function moveOutcomeHtml(m: MoveDefinition, hits1: boolean, hits2: boolean): string {
	const raw = hits1 && hits2 ? m.strong : hits1 || hits2 ? m.weak : m.miss;
	return moveMd(m, raw);
}

/** Who and where a move's log title names. */
export interface TitleNames {
	character: string;
	expedition?: string;
	foe?: string;
}

/**
 * A move roll's log title: the move's `logTitle` template when it has one,
 * else "{character} — {move name} ({stat})", or without the stat. The
 * template may use {character}, {stat}, {expedition}, {foe} and {move}.
 */
export function moveLogTitle(move: MoveDefinition, names: TitleNames, stat?: string): string {
	const tpl =
		move.logTitle ?? (stat ? `{character} — ${move.name} ({stat})` : `{character} — ${move.name}`);
	return tpl
		.replace('{character}', names.character)
		.replace('{stat}', stat ?? '')
		.replace('{expedition}', names.expedition ?? 'unknown expedition')
		.replace('{foe}', names.foe ?? 'unknown foe')
		.replace('{move}', move.name);
}

/** Plain text from HTML: tags dropped, entities decoded, spaces collapsed. */
export function stripHtml(html: string): string {
	return html
		.replace(/<[^>]*>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();
}

// ── Harm links ───────────────────────────────────────────────────────────────

/** What resolving a move's harm links needs: which move, how much harm, and
 *  the character's health and spirit, when known. */
export interface HarmContext {
	moveId?: string;
	foeHarm?: number;
	curHealth?: number;
	curSpirit?: number;
}

/**
 * Resolve a move's `-harm` links (`/health-=harm`, `/spirit-=harm`). In Endure Harm or
 * Endure Stress with a known amount, "-harm health/spirit" becomes the amount
 * ("3 harm"), split into the resource down to 0 and the momentum overflow
 * when the amount is more than the character has. Anywhere else it's plain
 * text. The miss text's "If you are at 0 health, you must mark …" clause
 * always shows, but when this blow can't bring the resource to 0 its links
 * are disabled.
 */
export function resolveHarmLinks(html: string, ctx?: HarmContext): string {
	const harm = ctx?.foeHarm ?? 1;
	const moveId = ctx?.moveId ?? '';

	// Endure Harm/Stress: suffer -harm to the resource; per the move, if that
	// would drop it below 0 the remainder converts to -momentum. When the
	// current value is known and smaller than the harm, split the display into
	// the resource amount (down to exactly 0) plus the momentum overflow. This
	// is descriptive text only — the dialog's Apply button commits it.
	function harmSplit(resource: 'health' | 'spirit', curVal?: number): string {
		// Canonical wording: you suffer "harm" (to health) / "stress" (to spirit).
		const harmWord = resource === 'health' ? 'harm' : 'stress';
		if (curVal !== undefined && harm > curVal) {
			const overflow = harm - curVal;
			const resPart =
				curVal > 0 ? `<span class="harm-amount">${curVal} ${harmWord}</span> and ` : '';
			return (
				resPart +
				`<span class="harm-amount">-${overflow} momentum</span>` +
				` <span class="harm-note">(overflow)</span>`
			);
		}
		return `<span class="harm-amount">${harm} ${harmWord}</span>`;
	}

	// Health harm-links: known foe → the amount; no foe → plain placeholder text.
	html = html.replace(
		/<a class="cmd-link" data-cmd="\/health-=harm"[^>]*>-harm health<\/a>/g,
		moveId === 'move/endure-harm' && ctx?.foeHarm !== undefined
			? harmSplit('health', ctx.curHealth)
			: '<span class="harm-note">-harm health</span>',
	);
	// Spirit harm-links: known foe → the amount; no foe → plain placeholder text.
	html = html.replace(
		/<a class="cmd-link" data-cmd="\/spirit-=harm"[^>]*>-harm spirit<\/a>/g,
		moveId === 'move/endure-stress' && ctx?.foeHarm !== undefined
			? harmSplit('spirit', ctx.curSpirit)
			: '<span class="harm-note">-harm spirit</span>',
	);

	// Endure Harm/Stress miss text carries a debility clause: "If you are at 0
	// <resource>, you must mark <X> or <Y> … or roll on the <oracle>." Rules text
	// is canon, so it always renders verbatim — but when we KNOW this blow won't
	// bring the resource to 0 (foe rank < current), the mark/oracle actions don't
	// apply, so their links are disabled (rendered as inert text). When the clause
	// applies, or the outcome can't be determined (no foe/character), links stay live.
	if (moveId === 'move/endure-harm' || moveId === 'move/endure-stress') {
		html = html.replace(
			/If you are at 0 (health|spirit), you must mark [\s\S]*?oracle<\/a>\./,
			(clause, resource) => {
				const curVal = resource === 'health' ? ctx?.curHealth : ctx?.curSpirit;
				const survives = ctx?.foeHarm !== undefined && curVal !== undefined && ctx.foeHarm < curVal;
				if (!survives) return clause; // clause applies, or can't tell → links live
				return clause.replace(
					/<a class="[^"]*-link"[^>]*>([\s\S]*?)<\/a>/g,
					'<span class="rule-disabled">$1</span>',
				);
			},
		);
	}
	return html;
}

// ── Burn momentum ────────────────────────────────────────────────────────────

/**
 * Whether burning momentum would improve an action roll, and from what to
 * what: momentum beats a challenge die the roll didn't. Null when momentum
 * isn't positive, the roll was a strong hit, the action die was cancelled, or
 * burning changes nothing.
 */
export function burnMomentumOffer(r: {
	momentum: number;
	cancelled: boolean;
	c1: number;
	c2: number;
	hits1: boolean;
	hits2: boolean;
}): { from: string; to: string } | null {
	const burn1 = r.momentum > r.c1 ? true : r.hits1;
	const burn2 = r.momentum > r.c2 ? true : r.hits2;
	if (r.cancelled || r.momentum <= 0 || (r.hits1 && r.hits2)) return null;
	if (burn1 === r.hits1 && burn2 === r.hits2) return null;
	return { from: outcomeLabel(r.hits1, r.hits2), to: outcomeLabel(burn1, burn2) };
}

/** The log entry that offers the burn: a `/burn` link bound to the roll
 *  (and the character), which LogPanel turns into the burn. */
export function burnMomentumHtml(r: {
	rollEntryId: string;
	charId: string;
	momentum: number;
	reset: number;
	from: string;
	to: string;
}): string {
	const link = commandLinkHtml(`burn momentum (${r.momentum} → reset ${r.reset})`, '/burn', {
		charId: r.charId,
		rollId: r.rollEntryId,
	});
	return `<p>You may ${link} to improve this from <em>${r.from}</em> to <em>${r.to}</em>.</p>`;
}

// ── Take a Hiatus ────────────────────────────────────────────────────────────

const HIATUS_DEBILITIES: Array<[key: string, label: string]> = [
	['wounded', 'Wounded'],
	['maimed', 'Maimed'],
	['shaken', 'Shaken'],
	['corrupted', 'Corrupted'],
	['cursed', 'Cursed'],
	['tormented', 'Tormented'],
	['unprepared', 'Unprepared'],
	['encumbered', 'Encumbered'],
];

/** A companion's health, for Take a Hiatus's link to restore it. */
export interface CompanionHealth {
	/** Its asset id, which the link binds as `companion`. */
	id: string;
	/** What it's called: the name given it, else its asset's. */
	name: string;
	health: number;
	max: number;
}

/**
 * Take a Hiatus's log body, from the character as it stands: a link to clear
 * each marked debility, to restore health, spirit and supply to 5, each
 * companion's health to its maximum, and to reset momentum, then the
 * reminder to Advance a Threat.
 */
export function takeAHiatusHtml(
	data: Record<string, unknown>,
	momentumResetValue: number,
	companions: CompanionHealth[] = [],
): string {
	const parts: string[] = [];
	// 1. Clear marked conditions
	const marked = HIATUS_DEBILITIES.filter(([key]) => data[key]);
	if (marked.length > 0) {
		const links = marked
			.map(([key, label]) => commandLinkHtml(`Clear ${label}`, `/${key}--`))
			.join(' · ');
		parts.push(`<p><strong>Conditions:</strong> ${links}</p>`);
	}
	// 2. Restore resources to max
	const restoreLinks: string[] = [];
	for (const key of ['health', 'spirit', 'supply']) {
		const delta = 5 - ((data[key] as number) ?? 0);
		if (delta > 0) {
			restoreLinks.push(commandLinkHtml(`+${delta} ${key}`, `/${key}=5`));
		}
	}
	if (restoreLinks.length > 0) {
		parts.push(`<p><strong>Resources:</strong> ${restoreLinks.join(' · ')}</p>`);
	}
	// Each companion's health to its maximum, bound to that companion.
	const companionLinks = companions
		.filter((c) => c.health < c.max)
		.map((c) =>
			commandLinkHtml(
				`${escHtml(c.name)} +${c.max - c.health} health`,
				`/companion.health=${c.max}`,
				{ companionId: c.id },
			),
		);
	if (companionLinks.length > 0) {
		parts.push(`<p><strong>Companions:</strong> ${companionLinks.join(' · ')}</p>`);
	}
	// 3. Momentum reset
	const momDelta = momentumResetValue - ((data['momentum'] as number) ?? 0);
	if (momDelta !== 0) {
		const disp = `${momDelta > 0 ? '+' : '−'}${Math.abs(momDelta)}`;
		parts.push(
			`<p><strong>Momentum:</strong> ` +
				commandLinkHtml(
					`${disp} momentum (reset to ${momentumResetValue})`,
					`/momentum=${momentumResetValue}`,
				) +
				`</p>`,
		);
	}
	// 4. Static reminders (always shown)
	parts.push(
		`<p>For each active threat: ` +
			commandLinkHtml('Advance a Threat', '/move advance-a-threat') +
			`.</p>`,
	);
	return parts.join('');
}
