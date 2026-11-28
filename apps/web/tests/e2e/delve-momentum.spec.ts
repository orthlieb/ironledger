/**
 * delve-momentum.spec.ts — the Delve moves' "+1 momentum" are links:
 *
 *   - Find an Opportunity's "Gain insight or prepare" takes it from the
 *     move's text in the Moves dialog, once (the link is struck).
 *   - Locate Your Objective's strong hit takes it from the log entry.
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
import { loadDice, queueDice } from './helpers/dice';

const DIALOG = '.moves-dialog';
const EXP_AREA = '.home-area--expeditions';

/** Bjorn's momentum, as the server has it. */
async function momentum(page: Page): Promise<number> {
	return await page.evaluate(async () => {
		const list = (await fetch('/api/characters', { credentials: 'include' }).then((r) =>
			r.json(),
		)) as Array<{ name: string; data: { momentum: number } }>;
		return list.find((c) => c.name === 'Bjorn')!.data.momentum;
	});
}

async function runCommand(page: Page, cmd: string): Promise<void> {
	const bar = page.locator('.cb-input');
	await bar.fill(cmd);
	await bar.press('Enter');
}

test.describe('Delve moves’ momentum links', () => {
	test.beforeEach(async ({ page }) => {
		const tok = await getTestToken();
		await resetAll(tok);
		await setExpansions({ delve: true }, tok);
		await seedCharacter('Bjorn', tok, { momentum: 2 });
		await loadDice(page);
		await page.goto('/home');
		await expect(page.locator('.home-area--characters .ca-tabs')).toBeVisible({
			timeout: 12_000,
		});
		await settleHome(page);
		// A site to delve: both moves need one.
		await page.locator(`${EXP_AREA} .ea-hdr-combobox`).click();
		await page.locator('.cb-item--action', { hasText: /New Site/i }).click();
		const dialog = page.locator('.confirm-modal');
		await expect(dialog).toBeVisible({ timeout: 5_000 });
		await dialog.locator('.co-input').first().fill('E2E Barrow');
		await dialog.locator('button:has-text("Create")').click();
		await expect(dialog).not.toBeVisible({ timeout: 5_000 });
	});

	test.afterEach(async () => {
		await resetExpansions();
	});

	test('Find an Opportunity’s “Gain insight or prepare” takes +1 momentum', async ({ page }) => {
		await runCommand(page, '/move find-an-opportunity');
		await expect(page.locator(DIALOG)).toBeVisible({ timeout: 5_000 });
		const link = page.locator(`${DIALOG} .md-trigger a.cmd-link[data-cmd="/momentum++"]`);
		await expect(link).toHaveText('+1 momentum');
		await link.click();
		await expect(page.locator('.cb-status')).toHaveText('Momentum 2 → 3');
		// Taken once: the link is struck.
		await expect(page.locator(`${DIALOG} .md-trigger s.resource-spent`)).toHaveText('+1 momentum');
		await expect.poll(() => momentum(page)).toBe(3);
	});

	test('Locate Your Objective’s strong hit takes +1 momentum from the log', async ({ page }) => {
		// Ten boxes of progress beat challenge dice of 1 and 2: a strong hit.
		await runCommand(page, '/site.progress+=10b');
		await expect(page.locator('.cb-status')).toContainText('10 boxes');
		await runCommand(page, '/move locate-your-objective');
		await expect(page.locator(DIALOG)).toBeVisible({ timeout: 5_000 });
		await queueDice(page, [1, 2]);
		await page.locator(DIALOG).getByRole('button', { name: 'Roll Move' }).click();

		const top = page.locator('.log-entry').first();
		await expect(top).toContainText('Locate Your Objective', { timeout: 8_000 });
		const entry = page.locator(
			`.log-entry[data-entry-id="${await top.getAttribute('data-entry-id')}"]`,
		);
		const link = entry.locator('a.cmd-link[data-cmd="/momentum++"]');
		await expect(link).toHaveText('+1 momentum');
		await link.click();
		await expect(page.locator('.cb-status')).toHaveText('Momentum 2 → 3');
		await expect(entry.locator('s.resource-spent')).toHaveText('+1 momentum');
		await expect.poll(() => momentum(page)).toBe(3);
	});
});
