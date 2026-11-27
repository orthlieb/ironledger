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
import { gotoHome, waitForArea } from './helpers/home';
import { openSettings } from './helpers/settings';

test.beforeEach(async ({ page }) => {
	// The Characters area finishing its first load proves the home page
	// hydrated (the other areas finish around the same time); settling lets
	// it finish hydrating, since on the dev server a click that lands before
	// it does is lost (the Settings menu never opens).
	await gotoHome(page);
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
	await openSettings(page);
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
		// Settles too, so mob-tab clicks register.
		await gotoHome(page);
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
	await waitForArea(page);
	await expect(page.locator('.mob-tabbar')).not.toBeVisible();
});

// ── ☰ on a phone ────────────────────────────────────────────────────────────
// A tap opens the menu on its touchend. Some browsers then send a click with
// no count (`detail` 0), which bits-ui's trigger takes for a screen reader's
// and toggles on, shutting the menu the moment it opened. This browser
// doesn't send one, so the test sends it, both ways it can come.

test.describe('☰ menu on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	for (const [what, init] of [
		['marked as a touch', 'touch'],
		['with no pointer type', ''],
	] as const) {
		test(`a tap opens it, and the click after it (${what}) leaves it open`, async ({ page }) => {
			const menu = page.locator('.hamburger-btn');
			await menu.tap();
			await menu.evaluate((el, pointerType) => {
				const opts = { bubbles: true, cancelable: true, detail: 0 };
				el.dispatchEvent(
					pointerType
						? new PointerEvent('click', { ...opts, pointerType })
						: new MouseEvent('click', opts),
				);
			}, init);
			const exportItem = page.getByRole('menuitem', { name: 'Export…' });
			await expect(exportItem).toBeVisible();
			// Still open once its opening has settled, and its items work.
			await page.waitForTimeout(400);
			await exportItem.tap();
			await expect(page.locator('.exd-dialog')).toBeVisible();
		});
	}

	test('a screen reader’s click on its own still opens it', async ({ page }) => {
		await page
			.locator('.hamburger-btn')
			.evaluate((el) =>
				el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 })),
			);
		await expect(page.getByRole('menuitem', { name: 'Export…' })).toBeVisible();
	});
});
