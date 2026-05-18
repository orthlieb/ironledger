import { test, expect } from '@playwright/test';

/**
 * Modal picker dialogs must lock the underlying page's scroll.
 * Without this, on mobile Safari a touch-drag inside the dialog's chrome
 * (or at the body's scroll boundaries) falls through and scrolls the page
 * behind the backdrop.
 *
 * v2: the home page has no `.loading-tab` and no tabs — the Foes area is
 * always rendered with its "+ Foe" header button.
 */

// NOTE: the v2 layout's mobile breakpoint (<= 900px) collapses the deck-of-
// cards into a stacked single-column view. Use a wider viewport so the Foes
// area + its header are still visible.
test.use({ viewport: { width: 950, height: 844 } });

const FOE_AREA   = '.home-area--foes';
const FOE_HEADER = `${FOE_AREA} .fa-header`;

async function gotoHomeAndWait(page: import('@playwright/test').Page) {
	await page.goto('/home');
	await expect(page.locator(`${FOE_AREA} .fa-loading`)).not.toBeVisible({ timeout: 12_000 });
	await page.locator(`${FOE_AREA} .fa-empty, ${FOE_AREA} .fa-body`).first()
		.waitFor({ timeout: 12_000, state: 'attached' });
}

test.beforeEach(async ({ page }) => {
	await gotoHomeAndWait(page);
});

test('page scroll is locked while foe picker dialog is open', async ({ page }) => {
	await page.locator(`${FOE_HEADER} button:has-text("+ Foe")`).click();
	await expect(page.locator('.foe-dialog[open]')).toBeVisible({ timeout: 5_000 });
	const htmlOverflow = await page.evaluate(() => getComputedStyle(document.documentElement).overflow);
	const bodyOverflow = await page.evaluate(() => getComputedStyle(document.body).overflow);
	expect(htmlOverflow).toBe('hidden');
	expect(bodyOverflow).toBe('hidden');
});

test('page scroll is restored after foe picker dialog closes', async ({ page }) => {
	await page.locator(`${FOE_HEADER} button:has-text("+ Foe")`).click();
	await expect(page.locator('.foe-dialog[open]')).toBeVisible({ timeout: 5_000 });
	await page.keyboard.press('Escape');
	await expect(page.locator('.foe-dialog[open]')).not.toBeVisible();
	const htmlOverflow = await page.evaluate(() => getComputedStyle(document.documentElement).overflow);
	expect(htmlOverflow).not.toBe('hidden');
});

test('dialog body uses overscroll-behavior: contain', async ({ page }) => {
	await page.locator(`${FOE_HEADER} button:has-text("+ Foe")`).click();
	await expect(page.locator('.fd-grid-wrap')).toBeVisible();
	const behavior = await page.locator('.fd-grid-wrap').evaluate(el => getComputedStyle(el).overscrollBehavior);
	expect(behavior).toContain('contain');
});
