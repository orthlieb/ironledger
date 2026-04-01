/**
 * adventure.spec.ts — Adventure tab: GCB tiles, Make a Move, Dice Roll,
 *                     Consult an Oracle, Add a Note.
 */
import { test, expect } from '@playwright/test';

test.describe('Adventure tab', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/home');
		// Wait for DB session to finish loading before clicking — prevents click being overwritten
		await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 8000 });
		await page.click('.tab-btn[data-tab="adventure"]');
		await expect(page.locator('.adventure-gcb')).toBeVisible({ timeout: 5000 });
	});

	// ── Layout ───────────────────────────────────────────────────────────────

	test('shows GCB column and log column', async ({ page }) => {
		await expect(page.locator('.adventure-gcb')).toBeVisible();
		await expect(page.locator('.adventure-log')).toBeVisible();
	});

	test('GCB has three tiles and four action buttons', async ({ page }) => {
		await expect(page.locator('.gc-tile')).toHaveCount(3);
		await expect(page.locator('.gc-action-btn')).toHaveCount(4);
	});

	// ── GCB tile popovers ─────────────────────────────────────────────────────

	test('clicking character tile opens its popover', async ({ page }) => {
		await page.locator('.gc-tile').first().locator('.gc-tile-btn').click();
		await expect(page.locator('.gc-popover').first()).toBeVisible({ timeout: 2000 });
		await page.keyboard.press('Escape');
	});

	test('clicking foe tile opens its popover', async ({ page }) => {
		await page.locator('.gc-tile').nth(1).locator('.gc-tile-btn').click();
		await expect(page.locator('.gc-popover').first()).toBeVisible({ timeout: 2000 });
		await page.keyboard.press('Escape');
	});

	test('clicking expedition tile opens its popover', async ({ page }) => {
		await page.locator('.gc-tile').nth(2).locator('.gc-tile-btn').click();
		await expect(page.locator('.gc-popover').first()).toBeVisible({ timeout: 2000 });
		await page.keyboard.press('Escape');
	});

	// ── Make a Move ──────────────────────────────────────────────────────────

	test('Make a Move button (1st action) opens moves dialog', async ({ page }) => {
		await page.locator('.gc-action-btn').first().click();
		await expect(page.locator('.moves-dialog[open]')).toBeVisible({ timeout: 3000 });
		await page.keyboard.press('Escape');
		await expect(page.locator('.moves-dialog[open]')).not.toBeVisible();
	});

	test('can browse move tiles in the picker', async ({ page }) => {
		await page.locator('.gc-action-btn').first().click();
		await expect(page.locator('.moves-dialog[open]')).toBeVisible({ timeout: 3000 });
		// Move tiles should be in the picker grid
		await expect(page.locator('.moves-dialog .md-tile').first()).toBeVisible({ timeout: 5000 });
		await page.keyboard.press('Escape');
	});

	test('clicking a move tile shows its detail view with Roll button', async ({ page }) => {
		await page.locator('.gc-action-btn').first().click();
		await expect(page.locator('.moves-dialog[open]')).toBeVisible({ timeout: 3000 });
		await page.locator('.moves-dialog .md-tile').first().click();
		// Detail view: Roll button or stat selector should appear
		await expect(
			page.locator('.moves-dialog button:has-text("Roll"), .moves-dialog .stat-btn')
		).toBeVisible({ timeout: 3000 });
		await page.keyboard.press('Escape');
	});

	// ── Dice Roll ────────────────────────────────────────────────────────────

	test('Roll Dice button (3rd action) opens dice dialog', async ({ page }) => {
		await page.locator('.gc-action-btn').nth(2).click();
		await expect(page.locator('.dice-dialog[open]')).toBeVisible({ timeout: 3000 });
		await page.keyboard.press('Escape');
	});

	test('clicking a quick-roll die button adds a result to the log', async ({ page }) => {
		const entriesBefore = await page.locator('.log-entry').count();
		await page.locator('.gc-action-btn').nth(2).click();
		await expect(page.locator('.dice-dialog[open]')).toBeVisible({ timeout: 3000 });
		// Click the d6 quick roll button
		await page.locator('.dice-dialog .quick-btn').first().click();
		// Wait up to 5 s for dice animation
		await expect(page.locator('.log-entry')).not.toHaveCount(entriesBefore, { timeout: 7000 });
		await page.keyboard.press('Escape');
	});

	// ── Consult an Oracle ────────────────────────────────────────────────────

	test('Ask an Oracle button (2nd action) opens oracles dialog', async ({ page }) => {
		await page.locator('.gc-action-btn').nth(1).click();
		await expect(page.locator('.oracles-dialog[open]')).toBeVisible({ timeout: 3000 });
		await page.keyboard.press('Escape');
	});

	test('clicking an oracle tile adds a result to the log', async ({ page }) => {
		const entriesBefore = await page.locator('.log-entry').count();
		await page.locator('.gc-action-btn').nth(1).click();
		await expect(page.locator('.oracles-dialog[open]')).toBeVisible({ timeout: 3000 });
		// Wait for oracle tiles to load before clicking
		const firstTile = page.locator('.oracles-dialog .od-tile').first();
		await expect(firstTile).toBeVisible({ timeout: 5000 });
		// Clicking a tile opens the detail view; then click Roll to roll and close
		await firstTile.click();
		const rollBtn = page.locator('.oracles-dialog button.od-roll-btn');
		await expect(rollBtn).toBeVisible({ timeout: 3000 });
		await rollBtn.click();
		// Oracle rolls add a log entry and close the dialog
		await expect(page.locator('.oracles-dialog[open]')).not.toBeVisible({ timeout: 5000 });
		await expect(page.locator('.log-entry')).not.toHaveCount(entriesBefore, { timeout: 5000 });
	});

	// ── Add a Note ───────────────────────────────────────────────────────────

	test('Add a Note button (4th action) opens notes dialog', async ({ page }) => {
		await page.locator('.gc-action-btn').nth(3).click();
		await expect(page.locator('.notes-dialog[open]')).toBeVisible({ timeout: 3000 });
		await page.keyboard.press('Escape');
	});

	test('adding a note creates a log entry', async ({ page }) => {
		const entriesBefore = await page.locator('.log-entry').count();
		await page.locator('.gc-action-btn').nth(3).click();
		await expect(page.locator('.notes-dialog[open]')).toBeVisible({ timeout: 3000 });
		await page.locator('.notes-dialog .nd-textarea').fill('E2E test note');
		await page.locator('.notes-dialog .nd-add-btn').click();
		await expect(page.locator('.notes-dialog[open]')).not.toBeVisible({ timeout: 3000 });
		await expect(page.locator('.log-entry')).not.toHaveCount(entriesBefore, { timeout: 5000 });
	});
});
