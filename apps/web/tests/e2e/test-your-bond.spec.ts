/**
 * test-your-bond.spec.ts — Test Your Bond's "clear the bond" (weak hit and
 * miss) is a `/bonds--` link: on a weak hit it takes a tick off the bonds
 * track, as Forge a Bond's `/bonds++` puts one on.
 */
import { test, expect, type Page } from '@playwright/test';
import { getTestToken, resetAll, seedCharacter } from './helpers/reset';
import { settleHome } from './helpers/home';
import { loadDice, queueDice } from './helpers/dice';

const DIALOG = '.moves-dialog';

/** Bjorn's bonds, as the server has them. */
async function bonds(page: Page): Promise<number> {
	return await page.evaluate(async () => {
		const list = (await fetch('/api/characters', { credentials: 'include' }).then((r) =>
			r.json(),
		)) as Array<{ name: string; data: { bonds: number } }>;
		return list.find((c) => c.name === 'Bjorn')!.data.bonds;
	});
}

test.describe('Test Your Bond', () => {
	test.beforeEach(async () => {
		const tok = await getTestToken();
		await resetAll(tok);
		// A box and a tick: enough bonds (a box) for the move to be made.
		await seedCharacter('Bjorn', tok, { bonds: 5 });
	});

	test('a weak hit’s “clear the bond” takes a tick off bonds', async ({ page }) => {
		await loadDice(page);
		await page.goto('/home');
		await expect(page.locator('.home-area--characters .ca-tabs')).toBeVisible({
			timeout: 12_000,
		});
		await settleHome(page);

		const bar = page.locator('.cb-input');
		await bar.fill('/move test-your-bond');
		await bar.press('Enter');
		await expect(page.locator(DIALOG)).toBeVisible({ timeout: 5_000 });
		// A weak hit: action die 6 beats a 1, not a 10.
		await queueDice(page, [6, 1, 10]);
		await page.locator(`${DIALOG} [data-tour="move-roll"]`).click();

		// The move's entry, by its id: the change's own entry goes above it.
		const top = page.locator('.log-entry').first();
		await expect(top).toContainText('tests a bond', { timeout: 8_000 });
		const entry = page.locator(
			`.log-entry[data-entry-id="${await top.getAttribute('data-entry-id')}"]`,
		);
		const clear = entry.locator('a.cmd-link[data-cmd="/bonds--"]');
		await expect(clear).toHaveText('clear the bond');
		await clear.click();
		await expect(page.locator('.cb-status')).toContainText('Bonds 1 box, 1 tick → 1 box');
		await expect(entry.locator('s.resource-spent')).toHaveText('clear the bond');
		await expect.poll(() => bonds(page)).toBe(4);
	});
});
