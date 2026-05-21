import { test, expect } from '@playwright/test';

/**
 * Modal picker dialogs must lock the underlying page's scroll.
 * Without this, on mobile Safari a touch-drag inside the dialog's chrome
 * (or at the body's scroll boundaries) falls through and scrolls the page
 * behind the backdrop.
 *
 * Architecture: html/body are always `overflow: hidden` (the viewport never
 * scrolls); `<main class="app-main">` is the route-level scroll container.
 * When a dialog opens, main is also locked so dialog gestures can't reach
 * inner scrolling content. The first two tests verify the main lock; the
 * third verifies that the dialog's own body declares overscroll containment.
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

test('main scroll is locked while foe picker dialog is open', async ({ page }) => {
	await page.locator(`${FOE_HEADER} button:has-text("+ Foe")`).click();
	await expect(page.locator('.foe-dialog[open]')).toBeVisible({ timeout: 5_000 });
	const mainOverflow = await page.evaluate(() => getComputedStyle(document.querySelector('main.app-main')!).overflowY);
	expect(mainOverflow).toBe('hidden');
});

test('main scroll is restored after foe picker dialog closes', async ({ page }) => {
	await page.locator(`${FOE_HEADER} button:has-text("+ Foe")`).click();
	await expect(page.locator('.foe-dialog[open]')).toBeVisible({ timeout: 5_000 });
	await page.keyboard.press('Escape');
	await expect(page.locator('.foe-dialog[open]')).not.toBeVisible();
	const mainOverflow = await page.evaluate(() => getComputedStyle(document.querySelector('main.app-main')!).overflowY);
	expect(mainOverflow).toBe('auto');
});

test('open dialog declares overscroll containment', async ({ page }) => {
	await page.locator(`${FOE_HEADER} button:has-text("+ Foe")`).click();
	const dialog = page.locator('.foe-dialog[open]');
	await expect(dialog).toBeVisible();
	const behavior = await dialog.evaluate(el => getComputedStyle(el).overscrollBehavior);
	expect(behavior).toContain('contain');
});

test('dialog body uses overscroll-behavior: contain', async ({ page }) => {
	await page.locator(`${FOE_HEADER} button:has-text("+ Foe")`).click();
	// Scope to [open] — FoePickerDialog is rendered twice on the page
	// (FoesArea + ExpeditionsArea), so the unscoped selector is ambiguous.
	const wrap = page.locator('.foe-dialog[open] .fd-grid-wrap');
	await expect(wrap).toBeVisible();
	const behavior = await wrap.evaluate(el => getComputedStyle(el).overscrollBehavior);
	expect(behavior).toContain('contain');
});
