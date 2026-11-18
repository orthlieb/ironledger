/**
 * move-choice.spec.ts — moves that act on a vow or a companion ask which in
 * the Moves dialog (docs/command-language.md → Moves that act on a vow or a
 * companion), and the choice binds `vow` / `companion` in their links.
 *
 * Covers: Fulfill Your Vow rolls against the chosen vow's progress (not 0);
 * Reach a Milestone marks progress on it; Advance a Threat's "mark menace"
 * marks the chosen vow's menace (not a foe's progress); Companion Endure
 * Harm's "+1 health" heals the companion, not the character.
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
		await expect
			.poll(async () => {
				const d = await bjorn(page);
				const hawk = (d.assets as Array<{ customValues: Record<string, string> }>)[0]!;
				return [hawk.customValues.health, d.health];
			})
			.toEqual(['2', 3]);
	});
});
