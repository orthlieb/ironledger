/**
 * asset-ability-log.spec.ts — an asset ability's one-time log links (`log`)
 * and abilities the rules grant (`free`). See docs/data-schema.md →
 * Ability log links.
 *
 *   - Adding Battle-Scarred writes its first ability's links into the
 *     asset's log entry, after the XP link; a +1 wits link raises wits and
 *     is spent.
 *   - Oathbreaker's third ability is free: with no XP left it can still be
 *     marked (the paid second can't), costs nothing, and its redemption
 *     links land in an "Asset modified" entry with no XP link.
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

async function addAsset(page: Page, name: string): Promise<void> {
	await page.locator(`${CHAR_HEADER} button[aria-label="Add Asset"]`).click();
	const picker = page.locator('.picker-dialog');
	await expect(picker).toBeVisible({ timeout: 5_000 });
	await picker.getByPlaceholder('Search by name or description…').fill(name);
	await picker.locator('.pick-tile', { hasText: name }).first().click();
	const dialog = page.locator('.ca-asset-dialog');
	await expect(dialog).toBeVisible({ timeout: 5_000 });
	await dialog.locator('.asset-footer .btn-primary').click();
	await expect(dialog).not.toBeVisible({ timeout: 5_000 });
	await expect(picker).not.toBeVisible({ timeout: 5_000 });
}

async function statValue(page: Page, stat: string): Promise<number> {
	const el = page.locator(`${CHAR_AREA} .ca-stat[data-stat="${stat}"] .stat-value-input`);
	return Number(((await el.textContent()) ?? '').trim());
}

async function runCommand(page: Page, cmd: string): Promise<void> {
	const bar = page.locator('.cb-input');
	await bar.fill(cmd);
	await bar.press('Enter');
}

test.describe('Asset ability log links and free abilities', () => {
	test.beforeAll(async () => {
		await resetCharacters();
	});

	test.beforeEach(async ({ page }) => {
		await page.goto('/home');
		await waitForArea(page, 'characters', { settle: true });
	});

	test('adding Battle-Scarred logs its first ability; a link raises wits', async ({ page }) => {
		await createCharacter(page, 'E2E Scarred');
		await page.locator(`${CHAR_AREA} .ca-tab`, { hasText: /^Core$/ }).click();
		const witsBefore = await statValue(page, 'wits');

		await addAsset(page, 'Battle-Scarred');

		const entry = page.locator('.log-entry', { hasText: 'Asset added: Battle-Scarred' }).first();
		await expect(entry).toBeVisible({ timeout: 5_000 });
		await expect(entry.locator('a.cmd-link[data-cmd="/xp-=3"]')).toHaveText('−3 experience');
		await expect(entry).toContainText('You focus your energies');
		await expect(entry.locator('a.cmd-link[data-cmd="/edge--"]')).toHaveCount(1);
		await expect(entry.locator('a.cmd-link[data-cmd="/wits++"]')).toHaveCount(2);

		await entry.locator('a.cmd-link[data-cmd="/wits++"]').first().click();
		// The link writes the change to the log, as typing the command would.
		await expect(page.locator('.log-entry', { hasText: /Wits: \d → \d/ }).first()).toBeVisible({
			timeout: 5_000,
		});
		// Adding an asset leaves the sheet on Assets; the stats are on Core.
		await page.locator(`${CHAR_AREA} .ca-tab`, { hasText: /^Core$/ }).click();
		await expect
			.poll(() => statValue(page, 'wits'), { timeout: 5_000 })
			.toBe(Math.min(4, witsBefore + 1));
		await expect(entry.locator('s.resource-spent').first()).toHaveText('+1 wits');
	});

	test('Oathbreaker’s third ability is free and logs its redemption', async ({ page }) => {
		await createCharacter(page, 'E2E Oathbreaker');
		await addAsset(page, 'Oathbreaker');
		// No XP left: only a free ability can still be marked.
		await runCommand(page, '/xp=0');
		await expect(page.locator('.cb-status')).toContainText('0', { timeout: 5_000 });

		await page.locator(`${CHAR_AREA} .ca-tab`, { hasText: /^Assets$/ }).click();
		await page.locator(`${CHAR_AREA} .ca-asset-card`, { hasText: 'Oathbreaker' }).click();
		const dialog = page.locator('.ca-asset-dialog');
		await expect(dialog).toBeVisible({ timeout: 5_000 });
		const rows = dialog.locator('.ability-row');
		await expect(rows.nth(1)).toHaveClass(/ability-disabled/);
		await expect(rows.nth(2)).not.toHaveClass(/ability-disabled/);
		await expect(rows.nth(2).locator('.ability-free')).toHaveText('No XP');

		await rows.nth(2).locator('.ability-check').click();
		await dialog.locator('.asset-footer .btn-primary').click();
		await expect(dialog).not.toBeVisible({ timeout: 5_000 });

		const entry = page.locator('.log-entry', { hasText: 'Asset modified: Oathbreaker' }).first();
		await expect(entry).toBeVisible({ timeout: 5_000 });
		await expect(entry).toContainText('You find redemption');
		await expect(entry.locator('a.cmd-link[data-cmd^="/xp"]')).toHaveCount(0);
		await expect(entry.locator('a.cmd-link[data-cmd="/shadow++"]')).toHaveCount(1);
	});
});
