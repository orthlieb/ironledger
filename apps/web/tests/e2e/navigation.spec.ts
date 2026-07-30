/**
 * navigation.spec.ts — top-level nav (v2).
 *
 * On desktop (>900px) v2 is a deck-of-cards layout with all four areas
 * visible simultaneously — no tabs. At ≤900px a mobile tab bar appears
 * (.mob-tabbar) with one tab per area; the active area is shown and the
 * others get .mob-hidden. The mobile-only tests at the bottom of the
 * file exercise that switch.
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.goto('/home');
	// Wait for the Characters area to finish initial load — proves the home
	// page hydrated. The other areas finish around the same time.
	await expect(page.locator('.home-area--characters .ca-loading')).not.toBeVisible({
		timeout: 12_000,
	});
});

test('page loads and shows all four home areas', async ({ page }) => {
	for (const area of ['characters', 'foes', 'expeditions', 'communities']) {
		await expect(page.locator(`.home-area--${area}`)).toBeVisible();
	}
});

test('app-nav exposes Move / Ask / Roll / Note action buttons', async ({ page }) => {
	// (The nav also carries a Map button now, so assert by name rather than count.)
	for (const name of ['Move', 'Ask', 'Roll', 'Note']) {
		await expect(page.locator('.app-nav .act-btn', { hasText: name }).first()).toBeVisible();
	}
});

test('log rail is visible alongside the areas', async ({ page }) => {
	await expect(page.locator('.home-log')).toBeVisible();
});

test('settings button opens settings dialog', async ({ page }) => {
	await page.click('.hamburger-btn');
	await page.locator('.hm-item', { hasText: /Settings/ }).click();
	await expect(page.locator('.settings-dialog')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.locator('.settings-dialog')).not.toBeVisible();
});

// ── Mobile tab bar (≤900px) ────────────────────────────────────────────────
// At ≤900px the home page shows .mob-tabbar with one tab per area and
// hides non-active areas via .mob-hidden. Above 900px the tab bar is
// hidden (display: none) and all four areas render side-by-side.

test.describe('Mobile tab bar (≤900px)', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 800, height: 900 });
		await page.goto('/home');
		await expect(page.locator('.home-area--characters .ca-loading')).not.toBeVisible({
			timeout: 12_000,
		});
		// Let hydration settle so mob-tab clicks register.
		await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
	});

	test('characters tab is active by default and characters area is visible', async ({ page }) => {
		await expect(page.locator('.mob-tabbar')).toBeVisible();
		await expect(page.locator('.mob-tab--active')).toHaveText(/Characters/i);
		await expect(page.locator('.home-area--characters')).not.toHaveClass(/mob-hidden/);
		await expect(page.locator('.home-area--foes')).toHaveClass(/mob-hidden/);
	});

	test('clicking the Foes tab switches the visible area to Foes', async ({ page }) => {
		await expect(page.locator('.mob-tabbar')).toBeVisible();
		await page.locator('.mob-tab', { hasText: 'Foes' }).click();
		// Wait for the swap to land before asserting the active tab label.
		await expect(page.locator('.home-area--foes')).not.toHaveClass(/mob-hidden/, {
			timeout: 5_000,
		});
		await expect(page.locator('.home-area--characters')).toHaveClass(/mob-hidden/);
		await expect(page.locator('.mob-tab--active')).toContainText(/Foes/i);
	});
});

test('mobile tab bar is hidden at desktop widths (>900px)', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto('/home');
	await expect(page.locator('.home-area--characters .ca-loading')).not.toBeVisible({
		timeout: 12_000,
	});
	await expect(page.locator('.mob-tabbar')).not.toBeVisible();
});
