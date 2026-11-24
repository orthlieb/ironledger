/**
 * moveRoll.test.ts — a move roll's log text (lib/moveRoll.ts): the roll lines,
 * the outcome, the title, the harm links, the burn-momentum offer and the
 * Take a Hiatus body.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import type { MoveDefinition } from '@ironledger/shared';
import {
	actionRollHtml,
	askOracleHtml,
	burnMomentumHtml,
	burnMomentumOffer,
	d100Faces,
	moveLogTitle,
	moveOutcomeBlock,
	outcomeClass,
	outcomeHeaderHtml,
	outcomeLabel,
	progressRollHtml,
	resolveHarmLinks,
	spellRollHtml,
	stripHtml,
	tableRollHtml,
	takeAHiatusHtml,
	delveDepthsColumn,
} from '../../src/lib/moveRoll.js';

const move = (extra: Partial<MoveDefinition> = {}) =>
	({ id: 'move/face-danger', name: 'Face Danger', ...extra }) as MoveDefinition;

describe('outcome', () => {
	it('is strong past both challenge dice, weak past one, else a miss', () => {
		expect([
			outcomeLabel(true, true),
			outcomeLabel(true, false),
			outcomeLabel(false, false),
		]).toEqual(['Strong Hit', 'Weak Hit', 'Miss']);
		expect(outcomeClass(false, true)).toBe('roll-outcome-weak');
	});

	it('says "with a match!" on matching challenge dice', () => {
		expect(outcomeHeaderHtml(true, true, true)).toBe(
			'<div class="roll-outcome-strong"><strong>Strong Hit</strong> <span class="roll-match">with a match!</span></div>',
		);
		expect(outcomeHeaderHtml(false, false)).toBe(
			'<div class="roll-outcome-miss"><strong>Miss</strong></div>',
		);
	});
});

describe('roll lines', () => {
	const roll = {
		actionDie: 4,
		cancelled: false,
		momentum: 2,
		stat: 'iron',
		statValue: 2,
		adds: 1,
		action: { score: 7, raw: 7 },
		c1: 3,
		c2: 9,
	};

	it('writes an action roll', () => {
		expect(actionRollHtml(roll)).toBe(
			'<div class="roll-line">1d6 [4] + iron[2] + adds[+1] = <strong>7</strong> vs 2d10 [3] [9]</div>',
		);
		expect(actionRollHtml({ ...roll, adds: -2 })).toContain('+ adds[−2]');
		expect(actionRollHtml({ ...roll, adds: 0 })).toContain('iron[2] = ');
	});

	it('notes a momentum cancel and strikes the cancelled die', () => {
		const html = actionRollHtml({ ...roll, cancelled: true, momentum: -4 });
		expect(html.startsWith('<div class="roll-cancel">Momentum cancel! Momentum is -4, ')).toBe(
			true,
		);
		expect(html).toContain('1d6 [<s>4</s>&thinsp;0]');
	});

	it('writes a progress roll, with the adds and their total when there are any', () => {
		expect(progressRollHtml(6, 0, 3, 9)).toBe(
			'<div class="roll-line">Progress [<strong>6</strong>] vs 2d10 [3] [9]</div>',
		);
		expect(progressRollHtml(6, 1, 3, 9)).toContain(
			'Progress [<strong>6</strong>] + Adds [<strong>+1</strong>] = [<strong>7</strong>]',
		);
	});

	it('writes a spell roll against its difficulty', () => {
		expect(spellRollHtml({ actionDie: 4, adds: 0, mana: 2, difficulty: 3, c1: 7 })).toBe(
			'<div class="roll-line">1d6 [4] + mana[2] = <strong>6</strong> vs difficulty[<strong>3</strong>] 1d10[7]</div>',
		);
	});

	it('writes an oracle question and a table roll', () => {
		expect(askOracleHtml(71, 'Likely', 26)).toContain(
			'<div class="roll-outcome-strong"><strong>Yes</strong> — Likely (≥26)</div>',
		);
		expect(askOracleHtml(12, 'Likely', 26)).toContain('<strong>No</strong>');
		expect(tableRollHtml(42, '<p>A storm</p>')).toBe(
			'<div class="roll-line">Roll: d100 → 42</div><div class="move-outcome"><p>A storm</p></div>',
		);
	});

	it('shows a d100 on two d10s, 100 as 10 and 10', () => {
		expect(d100Faces(42)).toEqual([4, 2]);
		expect(d100Faces(7)).toEqual([10, 7]);
		expect(d100Faces(30)).toEqual([3, 10]);
		expect(d100Faces(100)).toEqual([10, 10]);
	});
});

describe('moveLogTitle', () => {
	const names = { character: 'Ivy', expedition: 'To Whitebridge', foe: 'Bear' };

	it('names the character, the move and the stat', () => {
		expect(moveLogTitle(move(), names, 'Iron')).toBe('Ivy — Face Danger (Iron)');
		expect(moveLogTitle(move(), names)).toBe('Ivy — Face Danger');
	});

	it("fills the move's own template, with stand-ins for what isn't there", () => {
		const m = move({ logTitle: '{character} strikes {foe} on {expedition}' });
		expect(moveLogTitle(m, names)).toBe('Ivy strikes Bear on To Whitebridge');
		expect(moveLogTitle(m, { character: 'Ivy' })).toBe(
			'Ivy strikes unknown foe on unknown expedition',
		);
	});
});

describe('resolveHarmLinks', () => {
	const health = '<a class="cmd-link" data-cmd="/health-=harm">-harm health</a>';

	it('writes the harm in Endure Harm, and the momentum overflow past 0 health', () => {
		expect(resolveHarmLinks(health, { moveId: 'move/endure-harm', foeHarm: 2, curHealth: 4 })).toBe(
			'<span class="harm-amount">2 harm</span>',
		);
		expect(resolveHarmLinks(health, { moveId: 'move/endure-harm', foeHarm: 3, curHealth: 1 })).toBe(
			'<span class="harm-amount">1 harm</span> and <span class="harm-amount">-2 momentum</span> <span class="harm-note">(overflow)</span>',
		);
	});

	it('writes the harm on the chosen companion in Companion Endure Harm', () => {
		const companion =
			'<a class="cmd-link" data-cmd="/companion.health-=harm" data-verb="x">-harm health</a>';
		const at = (curCompanionHealth: number, foeHarm?: number) =>
			resolveHarmLinks(companion, {
				moveId: 'move/companion-endure-harm',
				foeHarm,
				curHealth: 5,
				curCompanionHealth,
			});
		expect(at(3, 2)).toBe('<span class="harm-amount">2 harm</span>');
		// Ash at 1, 3 harm: the leftover 2 comes off momentum.
		expect(at(1, 3)).toBe(
			'<span class="harm-amount">1 harm</span> and <span class="harm-amount">-2 momentum</span> <span class="harm-note">(overflow)</span>',
		);
		expect(at(1)).toBe('<span class="harm-note">-harm health</span>');
		expect(resolveHarmLinks(companion, { moveId: 'move/endure-harm', foeHarm: 2 })).toBe(
			'<span class="harm-note">-harm health</span>',
		);
	});

	it('leaves the placeholder as plain text elsewhere, or with no foe', () => {
		expect(resolveHarmLinks(health, { moveId: 'move/face-danger', foeHarm: 2 })).toBe(
			'<span class="harm-note">-harm health</span>',
		);
		expect(resolveHarmLinks(health, { moveId: 'move/endure-harm' })).toBe(
			'<span class="harm-note">-harm health</span>',
		);
	});

	it("disables the miss clause's links when this blow can't bring health to 0", () => {
		const clause =
			'If you are at 0 health, you must mark <a class="cmd-link" data-cmd="/wounded++">wounded</a> or roll on the <a class="cmd-link" data-cmd="/oracle x" data-verb="oracle">oracle</a>.';
		const safe = resolveHarmLinks(clause, {
			moveId: 'move/endure-harm',
			foeHarm: 1,
			curHealth: 4,
		});
		expect(safe).toContain('<span class="rule-disabled">wounded</span>');
		expect(safe).not.toContain('<a ');
		expect(resolveHarmLinks(clause, { moveId: 'move/endure-harm', foeHarm: 4, curHealth: 4 })).toBe(
			clause,
		);
	});
});

describe('burn momentum', () => {
	it('is offered when momentum beats a challenge die the roll did not', () => {
		expect(
			burnMomentumOffer({ momentum: 8, cancelled: false, c1: 7, c2: 3, hits1: false, hits2: true }),
		).toEqual({ from: 'Weak Hit', to: 'Strong Hit' });
	});

	it('is not offered on a strong hit, a cancelled die, no momentum, or no change', () => {
		const base = { momentum: 8, cancelled: false, c1: 7, c2: 3, hits1: false, hits2: true };
		expect(burnMomentumOffer({ ...base, hits1: true })).toBeNull();
		expect(burnMomentumOffer({ ...base, cancelled: true })).toBeNull();
		expect(burnMomentumOffer({ ...base, momentum: 0 })).toBeNull();
		expect(burnMomentumOffer({ ...base, momentum: 5 })).toBeNull();
	});

	it('is a /burn link bound to the roll and the character', () => {
		const html = burnMomentumHtml({
			rollEntryId: 'r1',
			charId: 'c1',
			momentum: 8,
			reset: 2,
			from: 'Weak Hit',
			to: 'Strong Hit',
		});
		expect(html).toContain('data-cmd="/burn"');
		expect(html).toContain('data-roll-entry-id="r1"');
		expect(html).toContain('data-char-id="c1"');
		expect(html).toContain('burn momentum (8 → reset 2)');
		expect(html).toContain('from <em>Weak Hit</em> to <em>Strong Hit</em>');
	});
});

describe('takeAHiatusHtml', () => {
	it('links each marked debility, the resources below 5 and the momentum reset', () => {
		const html = takeAHiatusHtml(
			{ wounded: true, shaken: true, health: 2, spirit: 5, supply: 4, momentum: 5 },
			2,
		);
		expect(html).toContain(
			'<a class="cmd-link" data-cmd="/wounded--">Clear Wounded</a> · <a class="cmd-link" data-cmd="/shaken--">Clear Shaken</a>',
		);
		expect(html).toContain('data-cmd="/health=5">+3 health</a>');
		expect(html).not.toContain('+0 spirit');
		expect(html).toContain('data-cmd="/momentum=2">−3 momentum (reset to 2)');
		expect(html).toContain('data-cmd="/move advance-a-threat" data-verb="move">Advance a Threat');
		expect(html).toContain('Advance a Threat');
	});

	it('leaves out what needs nothing', () => {
		const html = takeAHiatusHtml({ health: 5, spirit: 5, supply: 5, momentum: 2 }, 2, [
			{ id: 'companion/hawk', name: 'Ash', health: 3, max: 3 },
		]);
		expect(html).not.toContain('Conditions');
		expect(html).not.toContain('Resources');
		expect(html).not.toContain('Companions');
		expect(html).not.toContain('Momentum:');
	});

	it('restores each companion to its own maximum, bound to it', () => {
		const html = takeAHiatusHtml({ health: 5, spirit: 5, supply: 5, momentum: 2 }, 2, [
			{ id: 'companion/hawk', name: 'Ash', health: 1, max: 3 },
			{ id: 'companion/horse', name: 'Bran & Co', health: 5, max: 5 },
			{ id: 'companion/mammoth', name: 'Tusk', health: 2, max: 5 },
		]);
		expect(html).toContain(
			'<p><strong>Companions:</strong> ' +
				'<a class="cmd-link" data-cmd="/companion.health=3" data-companion-id="companion/hawk">Ash +2 health</a> · ' +
				'<a class="cmd-link" data-cmd="/companion.health=5" data-companion-id="companion/mammoth">Tusk +3 health</a></p>',
		);
		expect(html).not.toContain('Bran');
		expect(html).not.toContain('if applicable');
	});
});

describe('stripHtml', () => {
	it('drops tags, decodes entities and collapses spaces', () => {
		expect(stripHtml('<p>Ward &amp; <em>shield</em>\n  it</p>')).toBe('Ward & shield it');
	});
});

describe('delveDepthsColumn', () => {
	it('opens the weak-hit oracle on the column of the stat rolled', () => {
		const html =
			'<p>Roll on the <a class="cmd-link" data-cmd="/oracle delveDepths" data-verb="oracle">Delve the Depths Weak Hit Oracle</a>.</p>';
		expect(delveDepthsColumn(html, 'edge')).toBe(
			'<p>Roll on the <a class="cmd-link" data-cmd="/oracle delveDepths" data-verb="oracle" data-stat="edge">Delve the Depths Weak Hit Oracle (Edge column)</a>.</p>',
		);
	});
});

describe('moveOutcomeBlock', () => {
	const delve = move({
		id: 'move/delve-the-depths',
		name: 'Delve the Depths',
		tableType: 'delveDepths',
		strong: 'You find an opening.',
		weak: 'Roll on the [Delve the Depths Weak Hit Oracle](/oracle delveDepths).',
	} as Partial<MoveDefinition>);

	it('is the outcome text rendered in a move-outcome block, empty with no text', () => {
		expect(moveOutcomeBlock(delve, true, true)).toBe(
			'<div class="move-outcome"><p>You find an opening.</p></div>',
		);
		expect(moveOutcomeBlock(delve, false, false)).toBe('');
	});

	it('opens Delve the Depths’ weak-hit oracle on the stat’s column', () => {
		const html = moveOutcomeBlock(delve, true, false, { stat: 'shadow' });
		expect(html).toContain('data-cmd="/oracle delveDepths"');
		expect(html).toContain(
			'data-stat="shadow">Delve the Depths Weak Hit Oracle (Shadow column)</a>',
		);
		// Without the stat (a roll saved before it was kept), the link is plain.
		expect(moveOutcomeBlock(delve, true, false)).not.toContain('data-stat');
	});

	it('leaves other moves’ links alone, stat or not', () => {
		const other = move({ weak: 'Roll on the [oracle](/oracle delveDepths).' });
		expect(moveOutcomeBlock(other, true, false, { stat: 'edge' })).not.toContain('data-stat');
	});

	it('resolves harm links as resolveHarmLinks does, for its own move', () => {
		const endure = move({
			id: 'move/endure-harm',
			miss: 'Suffer [-harm health](/health-=harm).',
		});
		expect(moveOutcomeBlock(endure, false, false, { foeHarm: 2, curHealth: 4 })).toBe(
			'<div class="move-outcome"><p>Suffer <span class="harm-amount">2 harm</span>.</p></div>',
		);
	});
});

import { COMPANION_HEALTH_OVERFLOW } from '../../src/lib/cascadeRules.js';

describe('COMPANION_HEALTH_OVERFLOW', () => {
	it('offers the leftover as −momentum, for the companion’s character', () => {
		expect(COMPANION_HEALTH_OVERFLOW.logHtml({ overflow: 2, charId: 'c1', name: 'Ash & Co' })).toBe(
			'<p>Ash &amp; Co’s health is zero. You lose ' +
				'<a class="cmd-link" data-cmd="/momentum-=2" data-char-id="c1">-2 momentum</a> instead.</p>',
		);
	});
});
