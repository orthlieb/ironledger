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

const FOE_AREA = '.home-area--foes';
const FOE_HEADER = `${FOE_AREA} .fa-header`;

async function gotoHomeAndWait(page: import('@playwright/test').Page) {
	await page.goto('/home');
	await expect(page.locator(`${FOE_AREA} .fa-loading`)).not.toBeVisible({ timeout: 12_000 });
	await page
		.locator(`${FOE_AREA} .fa-empty, ${FOE_AREA} .fa-body`)
		.first()
		.waitFor({ timeout: 12_000, state: 'attached' });
	// Combobox triggers are unreliable mid-hydration — let loads settle.
	await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
}

/** v2: open the foe picker via the header combobox → "+ New foe…". */
async function openFoePicker(page: import('@playwright/test').Page) {
	await page.locator(`${FOE_HEADER} .fa-hdr-combobox`).click();
	await page.locator('.mp-cmd-item--action', { hasText: /New foe/i }).click();
}

test.beforeEach(async ({ page }) => {
	await gotoHomeAndWait(page);
});

// v2 scroll-lock architecture (see CLAUDE.md): the dialog is a bits-ui
// `Dialog` — a `position: fixed` overlay + content with `preventScroll` — so
// the page behind can't be reached. (The old per-route `<main>` overflow lock
// is retired; `main` stays `overflow-y: auto` whether or not a dialog is open.)
test('foe picker dialog + overlay are fixed-position (page behind is unreachable)', async ({
	page,
}) => {
	await openFoePicker(page);
	await expect(page.locator('.foe-dialog')).toBeVisible({ timeout: 5_000 });
	const dialogPos = await page
		.locator('.foe-dialog')
		.evaluate((el) => getComputedStyle(el).position);
	expect(dialogPos).toBe('fixed');
	const overlayPos = await page
		.locator('.foe-overlay')
		.first()
		.evaluate((el) => getComputedStyle(el).position);
	expect(overlayPos).toBe('fixed');
});

test('main stays scrollable-by-CSS; the fixed modal is what blocks it', async ({ page }) => {
	await openFoePicker(page);
	await expect(page.locator('.foe-dialog')).toBeVisible({ timeout: 5_000 });
	await page.keyboard.press('Escape');
	await expect(page.locator('.foe-dialog')).not.toBeVisible();
	const mainOverflow = await page.evaluate(
		() => getComputedStyle(document.querySelector('main.app-main')!).overflowY,
	);
	expect(mainOverflow).toBe('auto');
});

test("the dialog's scrollable body declares overscroll containment", async ({ page }) => {
	await openFoePicker(page);
	const wrap = page.locator('.foe-dialog .fd-grid-wrap');
	await expect(wrap).toBeVisible();
	const behavior = await wrap.evaluate((el) => getComputedStyle(el).overscrollBehavior);
	expect(behavior).toContain('contain');
});

test('dialog body uses overscroll-behavior: contain', async ({ page }) => {
	await openFoePicker(page);
	// Scope to [open] — FoePickerDialog is rendered twice on the page
	// (FoesArea + ExpeditionsArea), so the unscoped selector is ambiguous.
	const wrap = page.locator('.foe-dialog .fd-grid-wrap');
	await expect(wrap).toBeVisible();
	const behavior = await wrap.evaluate((el) => getComputedStyle(el).overscrollBehavior);
	expect(behavior).toContain('contain');
});
