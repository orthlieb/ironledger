/**
 * adventure.spec.ts — Adventure-action dialogs (v2).
 *
 * v2 has no Adventure tab and no GlobalContextBar. The MOVE / ASK / ROLL /
 * NOTE buttons live in `.app-nav` and are available on every page. The
 * active character is whatever spine is `.ca-spine--active` in the
 * Characters area.
 *
 * GCB-specific tile / popover tests have been removed (no longer applicable
 * in v2). The remaining tests cover that each action button opens the
 * correct dialog and that user interactions still produce log entries.
 */
import { test, expect } from '@playwright/test';

const CHAR_AREA   = '.home-area--characters';
const CHAR_HEADER = `${CHAR_AREA} .ca-header`;
const CHAR_SPINE  = `${CHAR_AREA} .ca-spine`;

const APP_NAV     = '.app-nav';

async function waitForCharactersArea(page: import('@playwright/test').Page) {
	await expect(page.locator(`${CHAR_AREA} .ca-loading`)).not.toBeVisible({ timeout: 12_000 });
	await page.locator(`${CHAR_AREA} .ca-empty, ${CHAR_AREA} .ca-body`).first()
		.waitFor({ timeout: 12_000, state: 'attached' });
}

test.describe('Adventure-action dialogs (v2)', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/home');
		await waitForCharactersArea(page);

		// Ensure at least one character exists AND is the active selection so moves
		// with preconditions aren't dimmed ("No character selected").
		if (await page.locator(CHAR_SPINE).count() === 0) {
			await page.locator(`${CHAR_HEADER} button:has-text("+ Character")`).click();
			await expect(page.locator(CHAR_SPINE)).not.toHaveCount(0, { timeout: 8_000 });
		}
		// Auto-select picks the first spine; ensure it is active.
		const first = page.locator(CHAR_SPINE).first();
		if (!(await first.evaluate(el => el.classList.contains('ca-spine--active')).catch(() => false))) {
			await first.click();
		}
		await expect(first).toHaveClass(/ca-spine--active/, { timeout: 3_000 });
		await expect(page.locator(APP_NAV)).toBeVisible();
	});

	// ── Layout ───────────────────────────────────────────────────────────────

	test('app-nav exposes the four adventure-action buttons', async ({ page }) => {
		await expect(page.locator(`${APP_NAV} .act-btn`)).toHaveCount(4);
	});

	test('the log rail is visible alongside the deck areas', async ({ page }) => {
		await expect(page.locator('.home-log')).toBeVisible();
	});

	// ── Make a Move ──────────────────────────────────────────────────────────

	test('Move button (1st action) opens moves dialog', async ({ page }) => {
		await page.locator(`${APP_NAV} .act-btn`).first().click();
		await expect(page.locator('.moves-dialog[open]')).toBeVisible({ timeout: 3_000 });
		await page.keyboard.press('Escape');
		await expect(page.locator('.moves-dialog[open]')).not.toBeVisible();
	});

	test('can browse move tiles in the picker', async ({ page }) => {
		await page.locator(`${APP_NAV} .act-btn`).first().click();
		await expect(page.locator('.moves-dialog[open]')).toBeVisible({ timeout: 3_000 });
		await expect(page.locator('.moves-dialog .md-tile').first()).toBeVisible({ timeout: 5_000 });
		await page.keyboard.press('Escape');
	});

	test('clicking a move tile shows its detail view with Roll button', async ({ page }) => {
		await page.locator(`${APP_NAV} .act-btn`).first().click();
		await expect(page.locator('.moves-dialog[open]')).toBeVisible({ timeout: 3_000 });
		await page.locator('.moves-dialog .md-tile').first().click();
		await expect(page.locator('.moves-dialog .md-body--detail')).toBeVisible({ timeout: 3_000 });
		await expect(
			page.locator('.moves-dialog .md-roll-btn, .moves-dialog .md-stat-row-btn').first(),
		).toBeVisible({ timeout: 3_000 });
		await page.keyboard.press('Escape');
	});

	// ── Dice Roll ────────────────────────────────────────────────────────────

	test('Roll button (3rd action) opens dice dialog', async ({ page }) => {
		await page.locator(`${APP_NAV} .act-btn`).nth(2).click();
		await expect(page.locator('.dice-dialog[open]')).toBeVisible({ timeout: 3_000 });
		await page.keyboard.press('Escape');
	});

	test('clicking a quick-roll die button adds a result to the log', async ({ page }) => {
		const entriesBefore = await page.locator('.log-entry').count();
		await page.locator(`${APP_NAV} .act-btn`).nth(2).click();
		await expect(page.locator('.dice-dialog[open]')).toBeVisible({ timeout: 3_000 });
		await page.locator('.dice-dialog .quick-btn').first().click();
		await expect(page.locator('.log-entry')).not.toHaveCount(entriesBefore, { timeout: 7_000 });
		await page.keyboard.press('Escape');
	});

	// ── Consult an Oracle ────────────────────────────────────────────────────

	test('Ask button (2nd action) opens oracles dialog', async ({ page }) => {
		await page.locator(`${APP_NAV} .act-btn`).nth(1).click();
		await expect(page.locator('.oracles-dialog[open]')).toBeVisible({ timeout: 3_000 });
		await page.keyboard.press('Escape');
	});

	test('clicking an oracle tile adds a result to the log', async ({ page }) => {
		const entriesBefore = await page.locator('.log-entry').count();
		await page.locator(`${APP_NAV} .act-btn`).nth(1).click();
		await expect(page.locator('.oracles-dialog[open]')).toBeVisible({ timeout: 3_000 });
		const firstTile = page.locator('.oracles-dialog .od-tile').first();
		await expect(firstTile).toBeVisible({ timeout: 5_000 });
		await firstTile.click();
		const rollBtn = page.locator('.oracles-dialog button.od-roll-btn');
		await expect(rollBtn).toBeVisible({ timeout: 3_000 });
		await rollBtn.click();
		await expect(page.locator('.oracles-dialog[open]')).not.toBeVisible({ timeout: 5_000 });
		await expect(page.locator('.log-entry')).not.toHaveCount(entriesBefore, { timeout: 5_000 });
	});

	// ── Add a Note ───────────────────────────────────────────────────────────

	test('Note button (4th action) opens notes dialog', async ({ page }) => {
		await page.locator(`${APP_NAV} .act-btn`).nth(3).click();
		await expect(page.locator('.notes-dialog[open]')).toBeVisible({ timeout: 3_000 });
		await page.keyboard.press('Escape');
	});

	test('adding a note creates a log entry', async ({ page }) => {
		const entriesBefore = await page.locator('.log-entry').count();
		await page.locator(`${APP_NAV} .act-btn`).nth(3).click();
		await expect(page.locator('.notes-dialog[open]')).toBeVisible({ timeout: 3_000 });
		await page.locator('.notes-dialog .nd-textarea').fill('E2E test note');
		await page.locator('.notes-dialog .nd-add-btn').click();
		await expect(page.locator('.notes-dialog[open]')).not.toBeVisible({ timeout: 3_000 });
		await expect(page.locator('.log-entry')).not.toHaveCount(entriesBefore, { timeout: 5_000 });
	});
});
