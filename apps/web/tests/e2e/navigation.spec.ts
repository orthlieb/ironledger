/**
 * navigation.spec.ts — top-level nav and tab switching.
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.goto('/home');
	// Wait for DB session to finish loading before clicking tabs
	await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 8000 });
});

test('page loads and shows all four tabs', async ({ page }) => {
	for (const tab of ['characters', 'foes', 'expeditions', 'adventure']) {
		await expect(page.locator(`.tab-btn[data-tab="${tab}"]`)).toBeVisible();
	}
});

test('characters tab switches on click', async ({ page }) => {
	await page.click('.tab-btn[data-tab="characters"]');
	await expect(page.locator('.tab-btn[data-tab="characters"]')).toHaveClass(/active/);
});

test('foes tab switches on click and shows toolbar', async ({ page }) => {
	await page.click('.tab-btn[data-tab="foes"]');
	await expect(page.locator('.tab-btn[data-tab="foes"]')).toHaveClass(/active/);
	await expect(page.locator('.char-toolbar').first()).toBeVisible();
});

test('expeditions tab switches on click and shows toolbar', async ({ page }) => {
	await page.click('.tab-btn[data-tab="expeditions"]');
	await expect(page.locator('.tab-btn[data-tab="expeditions"]')).toHaveClass(/active/);
	// Wait for expeditions-specific toolbar content
	await expect(page.locator('.char-toolbar button:has-text("+ Journey")')).toBeVisible({ timeout: 5000 });
});

test('adventure tab switches on click and shows GCB and log', async ({ page }) => {
	await page.click('.tab-btn[data-tab="adventure"]');
	await expect(page.locator('.tab-btn[data-tab="adventure"]')).toHaveClass(/active/);
	await expect(page.locator('.adventure-gcb')).toBeVisible({ timeout: 3000 });
	await expect(page.locator('.adventure-log')).toBeVisible({ timeout: 3000 });
});

test('settings button opens settings dialog', async ({ page }) => {
	await page.click('.hamburger-btn');
	await page.click('.menu-item:has-text("Settings")');
	await expect(page.locator('.settings-dialog')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.locator('.settings-dialog')).not.toBeVisible();
});

// ── Mobile swipe-to-switch-tab ───────────────────────────────────────────────
// Synthetic touch events on .tab-body should advance/retreat the active tab,
// clamped at the ends (no wrap-around).
async function swipeTabBody(page: import('@playwright/test').Page, dx: number, dy = 0) {
	await page.evaluate(({ dx, dy }) => {
		const el = document.querySelector('.tab-body');
		if (!el) throw new Error('.tab-body not found');
		const rect = el.getBoundingClientRect();
		const startX = rect.left + rect.width / 2;
		const startY = rect.top  + rect.height / 2;
		const mkTouch = (x: number, y: number) => new Touch({
			identifier: 1, target: el, clientX: x, clientY: y,
		});
		el.dispatchEvent(new TouchEvent('touchstart', {
			bubbles: true, cancelable: true,
			touches:       [mkTouch(startX, startY)],
			targetTouches: [mkTouch(startX, startY)],
			changedTouches:[mkTouch(startX, startY)],
		}));
		el.dispatchEvent(new TouchEvent('touchend', {
			bubbles: true, cancelable: true,
			touches: [], targetTouches: [],
			changedTouches: [mkTouch(startX + dx, startY + dy)],
		}));
	}, { dx, dy });
}

test('swipe-left on tab body advances to the next tab', async ({ page }) => {
	await page.click('.tab-btn[data-tab="characters"]');
	await expect(page.locator('.tab-btn[data-tab="characters"]')).toHaveClass(/active/);
	await swipeTabBody(page, -120);
	await expect(page.locator('.tab-btn[data-tab="foes"]')).toHaveClass(/active/);
});

test('swipe-right on tab body retreats to the previous tab', async ({ page }) => {
	await page.click('.tab-btn[data-tab="foes"]');
	await expect(page.locator('.tab-btn[data-tab="foes"]')).toHaveClass(/active/);
	await swipeTabBody(page, 120);
	await expect(page.locator('.tab-btn[data-tab="characters"]')).toHaveClass(/active/);
});

test('swipe is clamped at the first tab (no wrap-around)', async ({ page }) => {
	await page.click('.tab-btn[data-tab="characters"]');
	await swipeTabBody(page, 120);
	await expect(page.locator('.tab-btn[data-tab="characters"]')).toHaveClass(/active/);
});

test('swipe is clamped at the last tab (no wrap-around)', async ({ page }) => {
	await page.click('.tab-btn[data-tab="adventure"]');
	await swipeTabBody(page, -120);
	await expect(page.locator('.tab-btn[data-tab="adventure"]')).toHaveClass(/active/);
});

test('mostly-vertical drag does NOT switch tabs', async ({ page }) => {
	await page.click('.tab-btn[data-tab="characters"]');
	// |dx|=40, |dy|=200 → ratio fails; should stay on characters
	await swipeTabBody(page, 40, 200);
	await expect(page.locator('.tab-btn[data-tab="characters"]')).toHaveClass(/active/);
});

test('small horizontal movement (tap-like) does NOT switch tabs', async ({ page }) => {
	await page.click('.tab-btn[data-tab="characters"]');
	// |dx|=20 below 60px threshold
	await swipeTabBody(page, 20);
	await expect(page.locator('.tab-btn[data-tab="characters"]')).toHaveClass(/active/);
});
