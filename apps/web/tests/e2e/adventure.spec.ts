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
import { resetCharacters, seedCharacter } from './helpers/reset';
import { settleHome, ensureCharacter } from './helpers/home';

const CHAR_AREA = '.home-area--characters';

const APP_NAV = '.app-nav';

async function waitForCharactersArea(page: import('@playwright/test').Page) {
	await expect(page.locator(`${CHAR_AREA} .ca-loading`)).not.toBeVisible({ timeout: 12_000 });
	await page
		.locator(`${CHAR_AREA} .ca-empty, ${CHAR_AREA} .ca-body`)
		.first()
		.waitFor({ timeout: 12_000, state: 'attached' });
}

test.describe('Adventure-action dialogs (v2)', () => {
	test.beforeAll(async () => {
		await resetCharacters();
		await seedCharacter(); // pre-seed so beforeEach never hits the UI cold-start timeout
	});

	test.beforeEach(async ({ page }) => {
		await page.goto('/home');
		await waitForCharactersArea(page);
		await settleHome(page);
		await ensureCharacter(page);
		await expect(page.locator(APP_NAV)).toBeVisible();
	});

	// ── Layout ───────────────────────────────────────────────────────────────

	test('app-nav exposes the four adventure-action buttons', async ({ page }) => {
		for (const name of ['Move', 'Ask', 'Roll', 'Note']) {
			await expect(page.locator(`${APP_NAV} .act-btn`, { hasText: name }).first()).toBeVisible();
		}
	});

	test('the log rail is visible alongside the deck areas', async ({ page }) => {
		await expect(page.locator('.home-log')).toBeVisible();
	});

	// ── Make a Move ──────────────────────────────────────────────────────────

	test('Move button (1st action) opens moves dialog', async ({ page }) => {
		await page.locator(`${APP_NAV} .act-btn`, { hasText: 'Move' }).first().click();
		await expect(page.locator('.moves-dialog')).toBeVisible({ timeout: 3_000 });
		await page.keyboard.press('Escape');
		await expect(page.locator('.moves-dialog')).not.toBeVisible();
	});

	test('can browse move tiles in the picker', async ({ page }) => {
		await page.locator(`${APP_NAV} .act-btn`, { hasText: 'Move' }).first().click();
		await expect(page.locator('.moves-dialog')).toBeVisible({ timeout: 3_000 });
		await expect(page.locator('.moves-dialog .md-tile').first()).toBeVisible({ timeout: 5_000 });
		await page.keyboard.press('Escape');
	});

	test('clicking a move tile shows its detail view with Roll button', async ({ page }) => {
		await page.locator(`${APP_NAV} .act-btn`, { hasText: 'Move' }).first().click();
		await expect(page.locator('.moves-dialog')).toBeVisible({ timeout: 3_000 });
		// Click an always-enabled move by name — the first tile in DOM order can be a
		// prerequisite-gated move (e.g. Check Your Gear) rendered dimmed, and clicking
		// a dimmed tile is a deliberate no-op that never opens the detail view.
		// Lodestar ships its own "Face Danger" (Scene category) alongside the base
		// Adventure move; both are always-enabled — .first() picks the Adventure
		// tile (DOM order follows CATEGORY_ORDER, Adventure before Scene).
		await page
			.locator('.moves-dialog .md-tile', {
				has: page.locator('.md-tile-name', { hasText: /^Face Danger$/ }),
			})
			.first()
			.click();
		await expect(page.locator('.moves-dialog .md-body--detail')).toBeVisible({ timeout: 3_000 });
		await expect(
			page.locator('.moves-dialog .md-roll-btn, .moves-dialog .md-stat-row-btn').first(),
		).toBeVisible({ timeout: 3_000 });
		await page.keyboard.press('Escape');
	});

	// ── Dice Roll ────────────────────────────────────────────────────────────

	test('Roll button (3rd action) opens dice dialog', async ({ page }) => {
		await page.locator(`${APP_NAV} .act-btn`, { hasText: 'Roll' }).first().click();
		await expect(page.locator('.dice-dialog')).toBeVisible({ timeout: 3_000 });
		await page.keyboard.press('Escape');
	});

	test('clicking a quick-roll die button adds a result to the log', async ({ page }) => {
		// Count entries before — works whether the log starts empty or has prior entries.
		const countBefore = await page.locator('.log-entry').count();
		await page.locator(`${APP_NAV} .act-btn`, { hasText: 'Roll' }).first().click();
		await expect(page.locator('.dice-dialog')).toBeVisible({ timeout: 3_000 });
		await page.locator('.dice-dialog .quick-btn').first().click();
		await expect(page.locator('.log-entry')).not.toHaveCount(countBefore, { timeout: 7_000 });
		await page.keyboard.press('Escape');
	});

	// ── Consult an Oracle ────────────────────────────────────────────────────

	test('Ask button (2nd action) opens oracles dialog', async ({ page }) => {
		await page.locator(`${APP_NAV} .act-btn`, { hasText: 'Ask' }).first().click();
		await expect(page.locator('.oracles-dialog')).toBeVisible({ timeout: 3_000 });
		await page.keyboard.press('Escape');
	});

	test('clicking an oracle tile adds a result to the log', async ({ page }) => {
		const countBefore = await page.locator('.log-entry').count();
		await page.locator(`${APP_NAV} .act-btn`, { hasText: 'Ask' }).first().click();
		await expect(page.locator('.oracles-dialog')).toBeVisible({ timeout: 3_000 });
		// Target a specific oracle by name so the test is stable regardless of the
		// picker's category-then-name ordering.
		const plainTile = page.locator('.oracles-dialog .od-tile', {
			has: page.locator('.od-tile-name', { hasText: /^Core: Action$/ }),
		});
		await expect(plainTile).toBeVisible({ timeout: 5_000 });
		await plainTile.click();
		const rollBtn = page.locator('.oracles-dialog button.od-roll-btn');
		await expect(rollBtn).toBeVisible({ timeout: 3_000 });
		await rollBtn.click();
		await expect(page.locator('.oracles-dialog')).not.toBeVisible({ timeout: 5_000 });
		await expect(page.locator('.log-entry')).not.toHaveCount(countBefore, { timeout: 5_000 });
	});

	// ── Add a Note ───────────────────────────────────────────────────────────

	test('Note button (4th action) opens notes dialog', async ({ page }) => {
		await page.locator(`${APP_NAV} .act-btn`, { hasText: 'Note' }).first().click();
		await expect(page.locator('.notes-dialog')).toBeVisible({ timeout: 3_000 });
		await page.keyboard.press('Escape');
	});

	test('adding a note creates a log entry', async ({ page }) => {
		await page.locator(`${APP_NAV} .act-btn`, { hasText: 'Note' }).first().click();
		await expect(page.locator('.notes-dialog')).toBeVisible({ timeout: 3_000 });
		await page.locator('.notes-dialog .nd-textarea').fill('E2E test note');
		await page.locator('.notes-dialog .nd-add-btn').click();
		await expect(page.locator('.notes-dialog')).not.toBeVisible({ timeout: 3_000 });
		// Verify the note text appears in the newest log entry (log is newest-first).
		await expect(page.locator('.log-entry').first()).toContainText('E2E test note', {
			timeout: 5_000,
		});
	});
});
