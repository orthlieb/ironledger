/**
 * navigation.spec.ts — top-level nav (v2).
 *
 * v2 has no tabs and no tab-body swipe gestures — the home page is a
 * deck-of-cards layout with all four areas visible at once. Swipe / tap-
 * between-tabs tests are kept as `.skip` placeholders so we can revisit
 * if a v2 navigation equivalent appears.
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.goto('/home');
	// Wait for the Characters area to finish initial load — proves the home
	// page hydrated. The other areas finish around the same time.
	await expect(page.locator('.home-area--characters .ca-loading'))
		.not.toBeVisible({ timeout: 12_000 });
});

test('page loads and shows all four home areas', async ({ page }) => {
	for (const area of ['characters', 'foes', 'expeditions', 'communities']) {
		await expect(page.locator(`.home-area--${area}`)).toBeVisible();
	}
});

test('app-nav exposes Move / Ask / Roll / Note action buttons', async ({ page }) => {
	await expect(page.locator('.app-nav .act-btn')).toHaveCount(4);
});

test('log rail is visible alongside the areas', async ({ page }) => {
	await expect(page.locator('.home-log')).toBeVisible();
});

test('settings button opens settings dialog', async ({ page }) => {
	await page.click('.hamburger-btn');
	await page.click('.menu-item:has-text("Settings")');
	await expect(page.locator('.settings-dialog')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.locator('.settings-dialog')).not.toBeVisible();
});

// ── v1 tab/swipe tests — kept as documented `.skip` for revisit ─────────────
// v2 has no top-level tabs, no .tab-body, and no swipe handler. If a
// per-area expand/collapse navigation gesture lands later, port these.

test.skip('characters tab switches on click', async () => {
	// v2: no tabs — all areas are visible simultaneously.
});

test.skip('foes tab switches on click and shows toolbar', async () => {
	// v2: no tabs — the Foes area header is always visible.
});

