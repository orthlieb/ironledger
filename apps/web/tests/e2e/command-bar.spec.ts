/**
 * command-bar.spec.ts — the command language typed in the bar
 * (docs/command-language.md, docs/command-bar.md).
 *
 * Covers:
 *   • a value changed by name reaches the sheet, the log and the server:
 *     the active character's, another character's, an asset's, a vow's;
 *   • foes and expeditions by keyword and by name, a name two foes share,
 *     and making one active;
 *   • a content pack's global field (YRT's mana) held to its declared range,
 *     and a read-only field refused;
 *   • typeahead: Tab completes slot by slot, the top row says what Enter
 *     does, Enter runs, ↑ recalls; /move and /help open their dialogs;
 *   • on a phone: the operator keys, and a tap taking a suggestion.
 */
import { test, expect, type Page } from '@playwright/test';
import {
	getTestToken,
	resetAll,
	resetExpansions,
	seedCharacter,
	setExpansions,
} from './helpers/reset';
import { settleHome } from './helpers/home';

const API = 'http://127.0.0.1:3000/api/v1';
const CHAR_AREA = '.home-area--characters';

/** Seed the session's foes and expeditions (each PATCH replaces the list). */
async function seedSession(tok: string, key: 'encounters' | 'expeditions', rows: unknown[]) {
	const res = await fetch(`${API}/session/${key}`, {
		method: 'PATCH',
		headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ [key]: rows }),
	});
	if (!res.ok) throw new Error(`seed ${key} failed: ${res.status} ${await res.text()}`);
}

const foe = (name: string, rank: number, ticks = 0) => ({
	id: crypto.randomUUID(),
	foeId: 'ironsworn/wolf',
	quantity: 'solo',
	effectiveRank: rank,
	ticks,
	notes: '',
	customName: name,
	vanquished: false,
});

/** Bjorn (with a vow and a hawk he named Ash) and Edda. */
async function seedParty(tok: string) {
	await seedCharacter('Bjorn', tok, {
		momentum: 2,
		health: 4,
		spirit: 3,
		supply: 3,
		xp: 6,
		vows: [
			{ id: 'v1', name: 'Avenge Edda', difficulty: 'dangerous', ticks: 8, menace: 1, threat: '' },
		],
		assets: [
			{
				assetId: 'companion/hawk',
				abilities: [true, false, false],
				customValues: { 'companion-name': 'Ash' },
			},
		],
	});
	await seedCharacter('Edda', tok, { health: 5 });
}

async function openHome(page: Page) {
	await page.goto('/home');
	await expect(page.locator(`${CHAR_AREA} .ca-tabs`)).toBeVisible({ timeout: 12_000 });
	await settleHome(page);
}

/** Type a command and press Enter; returns the status line. */
async function run(page: Page, cmd: string) {
	const bar = page.locator('.cb-input');
	await bar.fill(cmd);
	await bar.press('Enter');
	return page.locator('.cb-status');
}

/** The characters as the server has them, by name. */
async function charactersByName(page: Page): Promise<Record<string, Record<string, unknown>>> {
	return await page.evaluate(async () => {
		const list = (await fetch('/api/characters', { credentials: 'include' }).then((r) =>
			r.json(),
		)) as Array<{ name: string; data: Record<string, unknown> }>;
		return Object.fromEntries(list.map((c) => [c.name, c.data]));
	});
}

/** The session's foes and expeditions as the server has them. */
async function sessionLists(page: Page) {
	return await page.evaluate(async () => {
		const s = await fetch('/api/session', { credentials: 'include' }).then((r) => r.json());
		return s as {
			encounters: Array<{ customName: string; ticks: number; vanquished: boolean }>;
			expeditions: Array<{ name: string; ticks: number; countdownFilled?: number }>;
		};
	});
}

const logLine = (page: Page, text: string | RegExp) =>
	page.locator('.log-entry', { hasText: text }).first();

test.describe('Command bar — the command language', () => {
	test.beforeEach(async () => {
		const tok = await getTestToken();
		await resetAll(tok);
		await seedParty(tok);
		await seedSession(tok, 'encounters', [foe('Wolf', 2, 10), foe('Raider', 1), foe('Raider', 1)]);
		await seedSession(tok, 'expeditions', [
			{
				id: crypto.randomUUID(),
				type: 'journey',
				name: 'The Long Road',
				difficulty: 'formidable',
				ticks: 0,
				notes: '',
				complete: false,
			},
			{
				id: crypto.randomUUID(),
				type: 'scene',
				name: 'Duel at Dawn',
				objective: '',
				consequences: '',
				difficulty: 'dangerous',
				ticks: 0,
				countdownFilled: 0,
				notes: '',
				complete: false,
			},
		]);
	});

	test('a value changed by name reaches the sheet, the log and the server', async ({ page }) => {
		await openHome(page);
		// Bjorn is first, so active.
		await expect(page.locator('.cb-chip-char')).toHaveText('Bjorn');

		await expect(await run(page, '/health-=2')).toHaveText('Health 4 → 2');
		await expect(
			page.locator(`${CHAR_AREA} .res-tile`).filter({ hasText: 'Health' }).locator('.res-value'),
		).toHaveText('2');
		await expect(logLine(page, 'Health: 4 → 2 (−2)')).toBeVisible();

		await expect(await run(page, '/wounded++')).toHaveText('Wounded: Cleared → Marked');
		await expect(await run(page, '/initiative=foe')).toHaveText('Initiative: None → Foe');
		await expect(await run(page, '/Edda.health-=1')).toHaveText('Edda: Health 5 → 4');
		await expect(await run(page, '/Ash.health--')).toHaveText('Ash: Health 3 → 2');
		await expect(await run(page, '/Avenge Edda.menace++')).toHaveText('Avenge Edda: Menace 1 → 2');

		// Refused, changing nothing: a party value given an owner, a unit on a
		// number, a slip of a name.
		await expect(await run(page, '/Bjorn.supply++')).toHaveText("Supply is the party's: /supply++");
		await expect(await run(page, '/health-=2b')).toHaveText('Health takes no unit.');
		await expect(await run(page, '/Edad.health--')).toHaveText(
			'Unknown name "Edad". Did you mean Edda?',
		);

		await expect
			.poll(async () => {
				const c = await charactersByName(page);
				const b = c.Bjorn!;
				const vows = b.vows as Array<{ menace: number }>;
				const assets = b.assets as Array<{ customValues: Record<string, string> }>;
				return [
					b.health,
					b.wounded,
					b.initiative,
					vows[0]!.menace,
					assets[0]!.customValues.health,
					c.Edda!.health,
				];
			})
			.toEqual([2, true, 2, 2, '2', 4]);
	});

	test('foes and expeditions by keyword and by name, and making one active', async ({ page }) => {
		await openHome(page);

		await expect(await run(page, '/foe=Wolf')).toHaveText(
			/Wolf (becomes|is already) the active foe/,
		);
		await expect(await run(page, '/foe.progress+=2')).toHaveText(
			'Wolf: Progress 2 boxes, 2 ticks → 6 boxes, 2 ticks',
		);
		await expect(
			logLine(page, 'Progress: 2 boxes, 2 ticks → 6 boxes, 2 ticks (+2 marks)'),
		).toBeVisible();

		// Two foes are called Raider: the command says how to name each.
		await expect(await run(page, '/Raider.progress++')).toHaveText(
			'There are 2 foes called Raider: /foe:Raider#1.progress, /foe:Raider#2.progress',
		);
		await expect(await run(page, '/foe:Raider#2.progress+=1b')).toHaveText(
			'Raider: Progress 0 boxes → 1 box',
		);
		await expect(await run(page, '/foe=Raider#2')).toHaveText('Raider becomes the active foe.');
		await expect(await run(page, '/foe.vanquished++')).toHaveText('Raider: Vanquished: No → Yes');

		await expect(await run(page, '/scene=Duel at Dawn')).toHaveText(
			'Duel at Dawn becomes the active scene.',
		);
		await expect(page.locator('.cb-chip', { hasText: 'Duel at Dawn' })).toBeVisible();
		await expect(await run(page, '/journey.progress++')).toHaveText(
			'No active journey: the active expedition is the scene Duel at Dawn.',
		);
		await expect(await run(page, '/scene.countdown++')).toHaveText('Duel at Dawn: Countdown 0 → 1');
		await expect(await run(page, '/The Long Road.progress++')).toHaveText(
			'The Long Road: Progress 0 boxes → 1 box',
		);

		await expect
			.poll(async () => {
				const s = await sessionLists(page);
				return [
					s.encounters.map((e) => [e.customName, e.ticks, e.vanquished]),
					s.expeditions.map((e) => [e.name, e.ticks, e.countdownFilled ?? 0]),
				];
			})
			.toEqual([
				[
					['Wolf', 26, false],
					['Raider', 0, false],
					['Raider', 4, true],
				],
				[
					['The Long Road', 4, 0],
					['Duel at Dawn', 0, 1],
				],
			]);
	});

	test('a content pack’s global field keeps its declared range; a read-only one is refused', async ({
		page,
	}) => {
		await setExpansions({ yrt: true });
		try {
			await openHome(page);
			await expect(await run(page, '/mana')).toHaveText('Mana 0/10');
			await expect(await run(page, '/mana+=12')).toHaveText('Mana 0 → 10 (max 10)');
			await expect(logLine(page, 'Mana: 0 → 10 (+12, max 10)')).toBeVisible();
			await expect(await run(page, '/mana!')).toHaveText("Mana isn't true/false.");
			await expect(await run(page, '/touched=prime')).toHaveText('Touched is read-only.');
			await expect
				.poll(async () => (await charactersByName(page)).Bjorn!.globalValues)
				.toEqual({ mana: '10' });
		} finally {
			await resetExpansions();
		}
	});

	test('/burn burns momentum on the newest action roll, spending its burn link', async ({
		page,
	}) => {
		await openHome(page);
		await expect(await run(page, '/burn')).toHaveText('No action roll to burn momentum on.');
		await expect(await run(page, '/momentum=6')).toHaveText('Momentum 2 → 6');

		// A missed roll, and the log's offer to burn momentum on it.
		const charId = await page.evaluate(async () => {
			const list = (await fetch('/api/characters', { credentials: 'include' }).then((r) =>
				r.json(),
			)) as Array<{ id: string; name: string }>;
			return list.find((c) => c.name === 'Bjorn')!.id;
		});
		const rollId = crypto.randomUUID();
		const offerId = crypto.randomUUID();
		await page.evaluate(
			({ rollId, offerId, charId }) => {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const log = (window as any).__testLog;
				log.appendLog(
					'Strike',
					'<div class="roll-outcome roll-outcome-miss"><p>Miss — pay the price.</p></div>',
					rollId,
					null,
					{ moveId: 'move/strike', actionScore: 1, c1: 1, c2: 9, charId },
				);
				log.appendLog(
					'Burn Momentum',
					`<p>You may <a class="burn-momentum-link" data-roll-entry-id="${rollId}" data-entry-id="${offerId}" data-char-id="${charId}">burn momentum</a>.</p>`,
					offerId,
				);
			},
			{ rollId, offerId, charId },
		);

		await expect(await run(page, '/burn')).toHaveText('Burned momentum (6 → reset 2).');
		const offer = page.locator(`.log-entry[data-entry-id="${offerId}"]`);
		await expect(offer.locator('a.burn-momentum-link')).toHaveCount(0);
		await expect(offer.locator('s.resource-spent')).toHaveText('burn momentum');
		await expect(page.locator(`.log-entry[data-entry-id="${rollId}"] .roll-burn`)).toBeVisible();
		await expect.poll(async () => (await run(page, '/momentum')).textContent()).toBe('Momentum 2');
		await expect(await run(page, '/burn')).toHaveText(
			'Momentum is already burned on the newest roll.',
		);
	});

	test('typeahead: Tab completes slot by slot, Enter runs, ↑ recalls', async ({ page }) => {
		await openHome(page);
		const bar = page.locator('.cb-input');
		await bar.click();
		await bar.pressSequentially('/he');
		await expect(page.locator('.cb-sugg-active .cb-sugg-label')).toHaveText('health');
		await expect(page.locator('.cb-ghost')).toContainText('alth');
		await expect(page.locator('.cb-top')).toHaveText('Enter: /health');

		// With a foe active, health's first operator takes its harm: Tab takes
		// the value, Tab again the operator, Enter runs it.
		await bar.press('Tab');
		await expect(bar).toHaveValue('/health');
		await expect(page.locator('.cb-sugg-label')).toHaveText([
			'-=harm',
			'++',
			'--',
			'+=',
			'-=',
			'=',
		]);
		await expect(page.locator('.cb-sugg-active .cb-sugg-hint')).toHaveText(
			'Health 4 → 2 (Wolf’s harm)',
		);
		await expect(page.locator('.cb-ghost')).toContainText('-=harm');
		await bar.press('Tab');
		await expect(bar).toHaveValue('/health-=harm');
		await bar.press('Enter');
		await expect(page.locator('.cb-status')).toHaveText('Health 4 → 2 (Wolf’s harm)');
		await expect(bar).toHaveValue('');

		// ↓ picks another operator; Enter takes it and, as it's a whole
		// command, runs it.
		await bar.pressSequentially('/health');
		await bar.press('ArrowDown');
		await bar.press('Enter');
		await expect(page.locator('.cb-status')).toHaveText('Health 2 → 3');

		// The active foe's track the same way: /pro, Tab, Tab, Enter marks
		// progress by its rank (Dangerous: 8 ticks).
		await bar.pressSequentially('/pro');
		await expect(page.locator('.cb-sugg-active .cb-sugg-label')).toHaveText('foe.progress');
		await bar.press('Tab');
		await bar.press('Tab');
		await expect(bar).toHaveValue('/foe.progress++');
		await bar.press('Enter');
		await expect(page.locator('.cb-status')).toHaveText(
			'Wolf: Progress 2 boxes, 2 ticks → 4 boxes, 2 ticks',
		);

		// An owner's row brings its dot; its values come next.
		await bar.pressSequentially('/As');
		await page.locator('.cb-sugg-item', { hasText: 'Ash' }).locator('button').click();
		await expect(bar).toHaveValue('/Ash.');
		await expect(page.locator('.cb-sugg-label')).toHaveText(['companion-name', 'health']);

		// ↑ in an empty bar brings back the last command run.
		await bar.fill('');
		await bar.press('ArrowUp');
		await expect(bar).toHaveValue('/foe.progress++');

		// /move opens the Moves dialog at the move.
		await run(page, '/move face danger');
		await expect(page.getByRole('dialog').getByText('Face Danger').first()).toBeVisible();
		await page.keyboard.press('Escape');

		// /help opens the help at a topic.
		await run(page, '/help tracks');
		await expect(page.locator('.ch-dialog')).toBeVisible();
		await expect(page.locator('.ch-section-focused .ch-heading')).toHaveText(
			'Progress tracks and units',
		);
	});
});

test.describe('Command bar — on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test.beforeEach(async () => {
		const tok = await getTestToken();
		await resetAll(tok);
		await seedParty(tok);
	});

	test('operator keys sit under the suggestions, and a tap takes one', async ({ page }) => {
		await openHome(page);
		const bar = page.locator('.cb-input');
		await bar.tap();
		await bar.pressSequentially('/momen');
		await page.locator('.cb-sugg-item', { hasText: 'momentum' }).locator('button').tap();
		await expect(bar).toHaveValue('/momentum');
		await page.locator('.cb-op', { hasText: '+=' }).tap();
		await expect(bar).toHaveValue('/momentum+=');
		await bar.pressSequentially('2');
		await expect(page.locator('.cb-top')).toHaveText('Enter: Momentum 2 → 4');
		await bar.press('Enter');
		await expect(page.locator('.cb-status')).toHaveText('Momentum 2 → 4');
	});
});
