/**
 * move-choice.spec.ts — moves that act on a vow or a companion ask which in
 * the Moves dialog (docs/command-language.md → Moves that act on a vow or a
 * companion), and the choice binds `vow` / `companion` in their links.
 *
 * Covers: Fulfill Your Vow rolls against the chosen vow's progress (not 0);
 * Reach a Milestone marks progress on it; Advance a Threat's "mark menace"
 * marks the chosen vow's menace (not a foe's progress); Companion Endure
 * Harm's "+1 health" heals the companion, not the character; Make Camp's
 * "any companions" heals every one; Take a Hiatus restores each to its
 * maximum.
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
import { pickBitsUiOption } from './helpers/bits-ui';

const CHAR_AREA = '.home-area--characters';
const DIALOG = '.moves-dialog';

/** Load the dice: `rollDie` draws one Uint32 per die from
 *  crypto.getRandomValues, so queued values come up in order. */
async function loadDice(page: Page) {
	await page.addInitScript(() => {
		const queue: number[] = [];
		(window as unknown as { __dice: number[] }).__dice = queue;
		const real = crypto.getRandomValues.bind(crypto);
		crypto.getRandomValues = ((arr: Uint32Array) => {
			if (queue.length && arr instanceof Uint32Array && arr.length === 1) {
				arr[0] = queue.shift() ?? 0;
				return arr;
			}
			return real(arr);
		}) as typeof crypto.getRandomValues;
	});
}

async function openHome(page: Page) {
	await page.goto('/home');
	await expect(page.locator(`${CHAR_AREA} .ca-tabs`)).toBeVisible({ timeout: 12_000 });
	await settleHome(page);
}

/** Open a move by its id, through the command bar. */
async function openMove(page: Page, id: string) {
	const bar = page.locator('.cb-input');
	await bar.fill(`/move ${id}`);
	await bar.press('Enter');
	await expect(page.locator(DIALOG)).toBeVisible({ timeout: 5_000 });
}

/** Bjorn as the server has him. */
async function bjorn(page: Page): Promise<Record<string, unknown>> {
	return await page.evaluate(async () => {
		const list = (await fetch('/api/characters', { credentials: 'include' }).then((r) =>
			r.json(),
		)) as Array<{ name: string; data: Record<string, unknown> }>;
		return list.find((c) => c.name === 'Bjorn')!.data;
	});
}

type SavedVow = { name: string; ticks: number; menace: number };

test.describe('Moves that act on a vow or a companion', () => {
	test.beforeEach(async () => {
		const tok = await getTestToken();
		await resetAll(tok);
		await seedCharacter('Bjorn', tok, {
			health: 3,
			supply: 3,
			momentum: 2,
			vows: [
				{ id: 'v1', name: 'Avenge Edda', difficulty: 'dangerous', ticks: 8, menace: 1, threat: '' },
				{
					id: 'v2',
					name: 'Find the Bell',
					difficulty: 'formidable',
					ticks: 20,
					menace: 0,
					threat: '',
				},
				{
					id: 'v3',
					name: 'Old Oath',
					difficulty: 'troublesome',
					ticks: 40,
					menace: 0,
					threat: '',
					status: 'fulfilled',
				},
			],
			assets: [
				{
					assetId: 'companion/hawk',
					abilities: [true, false, false],
					customValues: { 'companion-name': 'Ash', health: '1' },
				},
				{
					assetId: 'companion/horse',
					abilities: [true, false, false],
					customValues: { 'companion-name': 'Bran', health: '2' },
				},
			],
		});
	});

	test('Fulfill Your Vow rolls against the progress of the vow chosen', async ({ page }) => {
		await openHome(page);
		await openMove(page, 'fulfill-your-vow');
		const row = page.locator(`${DIALOG} [data-tour="move-choose"]`);
		await expect(row).toContainText('Vow');
		// The first active vow to start with: Avenge Edda, 8 ticks = 2 boxes.
		await expect(page.locator(`${DIALOG} .md-roll-status`)).toContainText('progress[2]');
		// Find the Bell, the second active vow.
		await pickBitsUiOption(page, `${DIALOG} .md-choose-select`, { index: 1 });
		await expect(page.locator(`${DIALOG} .md-roll-status`)).toContainText('progress[5]');
		// A fulfilled vow isn't offered.
		await page.locator(`${DIALOG} .md-choose-select`).click();
		await expect(page.locator('.bui-select-content .bui-select-item')).toHaveText([
			'Avenge Edda (Dangerous)',
			'Find the Bell (Formidable)',
		]);
		await page.keyboard.press('Escape');
	});

	test('Reach a Milestone marks progress on the vow chosen', async ({ page }) => {
		await openHome(page);
		await openMove(page, 'reach-a-milestone');
		// Find the Bell, the second active vow.
		await pickBitsUiOption(page, `${DIALOG} .md-choose-select`, { index: 1 });
		await page.locator(`${DIALOG} .md-trigger a.cmd-link[data-cmd="/vow.progress++"]`).click();
		// Formidable: 4 ticks a mark, 20 → 24.
		await expect(page.locator('.cb-status')).toHaveText(
			'Find the Bell: Progress 5 boxes → 6 boxes',
		);
		await expect(page.locator(`${DIALOG} .md-trigger s.resource-spent`)).toHaveText('progress');
		await expect
			.poll(async () => ((await bjorn(page)).vows as SavedVow[]).map((v) => v.ticks))
			.toEqual([8, 24, 40]);
	});

	test('Advance a Threat marks the chosen vow’s menace', async ({ page }) => {
		await setExpansions({ delve: true });
		try {
			await openHome(page);
			await openMove(page, 'advance-a-threat');
			// Find the Bell, the second active vow.
			await pickBitsUiOption(page, `${DIALOG} .md-choose-select`, { index: 1 });
			await page.locator(`${DIALOG} .md-roll-btn`).click();
			const entry = page.locator('.log-entry').first();
			const menace = entry.locator('a.cmd-link[data-cmd^="/vow.menace"]');
			await expect(menace).toBeVisible({ timeout: 8_000 });
			const twice = (await menace.getAttribute('data-cmd')) === '/vow.menace+=2';
			await menace.click();
			await expect(page.locator('.cb-status')).toHaveText(
				`Find the Bell: Menace 0 → ${twice ? 2 : 1}`,
			);
			await expect
				.poll(async () => ((await bjorn(page)).vows as SavedVow[]).map((v) => v.menace))
				.toEqual([1, twice ? 2 : 1, 0]);
		} finally {
			await resetExpansions();
		}
	});

	/** Each companion's health and Bjorn's, as the server has them. */
	async function healths(page: Page): Promise<[string[], number]> {
		const d = await bjorn(page);
		const assets = d.assets as Array<{ customValues: Record<string, string> }>;
		return [assets.map((a) => a.customValues.health!), d.health as number];
	}

	test('Make Camp’s “any companions” heals every companion at once', async ({ page }) => {
		await loadDice(page);
		await openHome(page);
		await openMove(page, 'make-camp');
		// A strong hit: action die 6 (+3 supply), challenge dice 1 and 1.
		await page.evaluate(() =>
			(window as unknown as { __dice: number[] }).__dice.push(...[6, 1, 1].map((f) => f - 1)),
		);
		await page.locator(`${DIALOG} [data-tour="move-roll"]`).click();
		// The Make Camp entry, by its id: the heals log entries above it.
		const top = page.locator('.log-entry').first();
		await expect(top).toContainText('makes camp', { timeout: 8_000 });
		const id = await top.getAttribute('data-entry-id');
		const camp = page.locator(`.log-entry[data-entry-id="${id}"]`);
		const all = camp.locator('a.cmd-link[data-cmd="/companions.health++"]');
		// Recuperate and Partake.
		await expect(all).toHaveCount(2);
		await expect(all.first()).toHaveText('any companions');
		await all.first().click();
		await expect(page.locator('.cb-status')).toHaveText('Ash: Health 1 → 2; Bran: Health 2 → 3');
		await expect(camp.locator('s.resource-spent')).toHaveText('any companions');
		// Each companion's change is its own entry.
		await expect(page.locator('.log-entry').nth(0)).toContainText('Bran');
		await expect(page.locator('.log-entry').nth(1)).toContainText('Ash');
		await expect.poll(() => healths(page)).toEqual([['2', '3'], 3]);
	});

	test('Take a Hiatus restores each companion to its maximum', async ({ page }) => {
		await setExpansions({ delve: true });
		try {
			await openHome(page);
			await openMove(page, 'take-a-hiatus');
			await page.locator(`${DIALOG} .md-roll-btn`).click();
			const top = page.locator('.log-entry').first();
			await expect(top).toContainText('takes a hiatus', { timeout: 8_000 });
			const entry = page.locator(
				`.log-entry[data-entry-id="${await top.getAttribute('data-entry-id')}"]`,
			);
			// The hawk tops out at 3, the horse at 5.
			const links = entry.locator('a.cmd-link[data-cmd^="/companion.health="]');
			await expect(links).toHaveText(['Ash +2 health', 'Bran +3 health']);
			await links.nth(1).click();
			await expect(page.locator('.cb-status')).toHaveText('Bran: Health 2 → 5');
			await expect(entry.locator('s.resource-spent')).toHaveText('Bran +3 health');
			await expect.poll(() => healths(page)).toEqual([['1', '5'], 3]);
		} finally {
			await resetExpansions();
		}
	});

	test('Companion Endure Harm heals the companion, not the character', async ({ page }) => {
		await loadDice(page);
		await openHome(page);
		await openMove(page, 'companion-endure-harm');
		await expect(page.locator(`${DIALOG} [data-tour="move-choose"]`)).toContainText('Ash');
		// A strong hit: action die 6, challenge dice 1 and 1.
		await page.evaluate(() =>
			(window as unknown as { __dice: number[] }).__dice.push(...[6, 1, 1].map((f) => f - 1)),
		);
		await page.locator(`${DIALOG} [data-tour="move-roll"]`).click();
		const heal = page
			.locator('.log-entry')
			.first()
			.locator('a.cmd-link[data-cmd="/companion.health++"]');
		await expect(heal).toBeVisible({ timeout: 8_000 });
		await heal.click();
		await expect(page.locator('.cb-status')).toHaveText('Ash: Health 1 → 2');
		// The first companion, Ash, is chosen: Bran is untouched.
		await expect.poll(() => healths(page)).toEqual([['2', '2'], 3]);
	});
});
