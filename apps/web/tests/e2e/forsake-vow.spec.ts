/**
 * forsake-vow.spec.ts — forsaking a vow from the command bar and with the
 * Forsake Your Vow move, each writing what the vow card's Forsake writes:
 * "Forsook the iron vow … — Endure Stress (−n) for its rank."
 *
 *   - `/Oath One.status=forsaken` marks it forsaken and logs the line with
 *     its Endure Stress link.
 *   - `/move forsake your vow`, the vow chosen, Use Move: the vow is
 *     forsaken, and the move's entry carries the line.
 */
import { test, expect, type Page } from '@playwright/test';
import { resetCharacters } from './helpers/reset';
import { waitForArea } from './helpers/home';

const CHAR_AREA = '.home-area--characters';
const CHAR_HEADER = `${CHAR_AREA} .ca-header`;

async function createCharacter(page: Page, name: string): Promise<void> {
	await page.locator(`${CHAR_HEADER} .ca-hdr-combobox`).click();
	await page.locator('.cb-item--action', { hasText: /New character/i }).click();
	const dialog = page.locator('.confirm-modal');
	await expect(dialog).toBeVisible({ timeout: 5_000 });
	await dialog.locator('.co-input').fill(name);
	await dialog.locator('.sa-field .dice-btn').click();
	await dialog.locator('.btn-primary').click();
	await expect(dialog).not.toBeVisible({ timeout: 5_000 });
	await expect(page.locator(`${CHAR_AREA} .ca-tab`).first()).toBeVisible({ timeout: 8_000 });
}

async function swear(page: Page, name: string): Promise<void> {
	await page.locator(`${CHAR_HEADER} button[aria-label="Add Vow"]`).click();
	const dialog = page.locator('.confirm-modal');
	await expect(dialog).toBeVisible({ timeout: 5_000 });
	await dialog.locator('.co-input').fill(name);
	await dialog.locator('.btn-primary').click();
	await expect(dialog).not.toBeVisible({ timeout: 5_000 });
}

const vowCard = (page: Page, name: string) =>
	page.locator(`${CHAR_AREA} .vow-card`, { hasText: name });

const forsaken = (page: Page, name: string) =>
	expect(vowCard(page, name).getByRole('radio', { name: 'Mark forsaken' })).toHaveAttribute(
		'aria-checked',
		'true',
		{ timeout: 5_000 },
	);

async function runCommand(page: Page, cmd: string): Promise<void> {
	const bar = page.locator('.cb-input');
	await bar.fill(cmd);
	await bar.press('Enter');
}

test.describe('Forsaking a vow', () => {
	test.beforeAll(async () => {
		await resetCharacters();
	});

	test('by command and by the move, each logging Endure Stress at its rank', async ({ page }) => {
		await page.goto('/home');
		await waitForArea(page, 'characters', { settle: true });
		await createCharacter(page, 'E2E Oathsworn');
		await swear(page, 'Oath One');
		await swear(page, 'Oath Two');
		await page.locator(`${CHAR_AREA} .ca-tab`, { hasText: /^Vows$/ }).click();

		// Typed: the status, then the card's forsake line.
		await runCommand(page, '/Oath One.status=forsaken');
		await forsaken(page, 'Oath One');
		const typed = page.locator('.log-entry', { hasText: 'Forsook the iron vow Oath One' }).first();
		await expect(typed).toBeVisible();
		await expect(typed.locator('a.cmd-link[data-cmd^="/move endure-stress "]')).toHaveText(
			'Endure Stress',
		);

		// The move: Oath Two, the only vow still active, is the one chosen.
		await runCommand(page, '/move forsake your vow');
		const dialog = page.locator('.moves-dialog');
		await expect(dialog).toBeVisible({ timeout: 5_000 });
		await dialog.getByRole('button', { name: 'Use Move' }).click();
		await expect(dialog).not.toBeVisible({ timeout: 5_000 });
		await forsaken(page, 'Oath Two');
		const moved = page.locator('.log-entry', { hasText: 'forsakes their vow' }).first();
		await expect(moved).toContainText('Forsook the iron vow Oath Two');
		await expect(moved.locator('a.cmd-link[data-cmd^="/move endure-stress "]')).toHaveCount(1);
	});
});
