import { test, expect } from '@playwright/test';

/**
 * Modal picker dialogs must lock the underlying page's scroll.
 * Without this, on mobile Safari a touch-drag inside the dialog's chrome
 * (or at the body's scroll boundaries) falls through and scrolls the page
 * behind the backdrop.
 */

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
	await page.goto('/home');
	await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 8000 });
});

test('page scroll is locked while foe picker dialog is open', async ({ page }) => {
	await page.click('.tab-btn[data-tab="foes"]');
	await page.click('button:has-text("+ Foe")');
	await expect(page.locator('.foe-dialog[open]')).toBeVisible({ timeout: 5000 });
	const htmlOverflow = await page.evaluate(() => getComputedStyle(document.documentElement).overflow);
	const bodyOverflow = await page.evaluate(() => getComputedStyle(document.body).overflow);
	expect(htmlOverflow).toBe('hidden');
	expect(bodyOverflow).toBe('hidden');
});

test('page scroll is restored after foe picker dialog closes', async ({ page }) => {
	await page.click('.tab-btn[data-tab="foes"]');
	await page.click('button:has-text("+ Foe")');
	await expect(page.locator('.foe-dialog[open]')).toBeVisible({ timeout: 5000 });
	await page.keyboard.press('Escape');
	await expect(page.locator('.foe-dialog[open]')).not.toBeVisible();
	const htmlOverflow = await page.evaluate(() => getComputedStyle(document.documentElement).overflow);
	expect(htmlOverflow).not.toBe('hidden');
});

test('dialog body uses overscroll-behavior: contain', async ({ page }) => {
	await page.click('.tab-btn[data-tab="foes"]');
	await page.click('button:has-text("+ Foe")');
	await expect(page.locator('.fd-grid-wrap')).toBeVisible();
	const behavior = await page.locator('.fd-grid-wrap').evaluate(el => getComputedStyle(el).overscrollBehavior);
	expect(behavior).toContain('contain');
});
