/**
 * view-mode.spec.ts — home-page layout mode toggle (Grid / Log / Tabs).
 *
 * The mode is driven by the `viewModeStore` and exposed via the
 * hamburger menu's "View" submenu on desktop (≥900 px) and by the
 * global `Alt+V` keyboard shortcut. Mobile viewport (<900 px)
 * always renders the Tabs layout regardless of stored preference.
 *
 * These tests drive the mode via Alt+V rather than the hamburger
 * submenu — same code path (`setViewMode`), fewer flaky moving
 * parts (bits-ui submenu portal + hover-to-open). The submenu is
 * exercised implicitly by the store test.
 */
import { test, expect } from '@playwright/test';

const HOME_SHELL = '.home-shell';

/** Wait for hydration by watching for the Characters area to load. */
async function waitForHydrated(page: import('@playwright/test').Page) {
	await expect(page.locator('.home-area--characters .ca-loading')).not.toBeVisible({
		timeout: 12_000,
	});
	// The Alt+V keydown handler is wired in the root layout's onMount, which can
	// land slightly after the characters area finishes loading — pressing before
	// then drops the first keystroke. `data-view` on <html> is set in that same
	// onMount (and never in SSR), so waiting for it guarantees the handler is live.
	await expect(page.locator('html')).toHaveAttribute('data-view', /^(grid|log|tabs)$/, {
		timeout: 5_000,
	});
}

/** Read the current layout mode off the shell's class list. */
async function currentLayout(
	page: import('@playwright/test').Page,
): Promise<'grid' | 'log' | 'tabs'> {
	const cls = (await page.locator(HOME_SHELL).getAttribute('class')) ?? '';
	if (cls.includes('home-shell--layout-log')) return 'log';
	if (cls.includes('home-shell--layout-tabs')) return 'tabs';
	return 'grid';
}

/** Reset stored preference so each test starts from a known state. */
async function resetViewMode(page: import('@playwright/test').Page) {
	await page.evaluate(() => localStorage.removeItem('ironledger:layout:mode'));
}

test.describe('View mode (Grid / Log / Tabs)', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/home');
		await resetViewMode(page);
		await page.reload();
		await waitForHydrated(page);
		// Sanity — we begin in Grid on a fresh state.
		await expect(page.locator(HOME_SHELL)).toBeVisible();
		expect(await currentLayout(page)).toBe('grid');
	});

	test('Grid mode shows the 2×2 deck with all four areas and both handles', async ({ page }) => {
		for (const area of ['characters', 'foes', 'expeditions', 'communities']) {
			await expect(page.locator(`.home-area--${area}`)).toBeVisible();
		}
		await expect(page.locator(`${HOME_SHELL} .home-log`)).toBeVisible();
		await expect(page.locator(`${HOME_SHELL} .col-resize-handle`)).toBeAttached();
		await expect(page.locator(`${HOME_SHELL} .row-resize-handle`).first()).toBeAttached();
		// Tabs-only bits are absent (mob-tabbar is display:none unless a tabs-flavour layout)
		await expect(page.locator(`${HOME_SHELL} .mob-tabbar`)).not.toBeVisible();
	});

	test('Alt+V cycles Grid → Log → Tabs → Grid', async ({ page }) => {
		// Alt+V once → Log
		await page.keyboard.press('Alt+v');
		await expect.poll(() => currentLayout(page), { timeout: 2_000 }).toBe('log');
		// Log-mode chrome: tabbar visible; col/row/mobile handles hidden.
		await expect(page.locator(`${HOME_SHELL} .mob-tabbar`)).toBeVisible();
		await expect(page.locator(`${HOME_SHELL} .col-resize-handle`)).not.toBeVisible();
		await expect(page.locator(`${HOME_SHELL} .row-resize-handle`).first()).not.toBeVisible();
		await expect(page.locator(`${HOME_SHELL} .mob-resize-handle`)).not.toBeVisible();
		await expect(page.locator(`${HOME_SHELL} .home-log`)).toBeVisible();
		// Only the active panel shows; the other three hide via `.mob-hidden`.
		const visibleAreas = await page.locator(`${HOME_SHELL} .home-area:not(.mob-hidden)`).count();
		expect(visibleAreas).toBe(1);

		// Alt+V again → Tabs
		await page.keyboard.press('Alt+v');
		await expect.poll(() => currentLayout(page), { timeout: 2_000 }).toBe('tabs');
		// Tabs-mode chrome: tabbar visible; mob-resize-handle visible; log at bottom.
		await expect(page.locator(`${HOME_SHELL} .mob-tabbar`)).toBeVisible();
		await expect(page.locator(`${HOME_SHELL} .mob-resize-handle`)).toBeVisible();
		await expect(page.locator(`${HOME_SHELL} .col-resize-handle`)).not.toBeVisible();
		await expect(page.locator(`${HOME_SHELL} .home-log`)).toBeVisible();

		// Alt+V again → back to Grid
		await page.keyboard.press('Alt+v');
		await expect.poll(() => currentLayout(page), { timeout: 2_000 }).toBe('grid');
	});

	test('chosen mode persists across a reload', async ({ page }) => {
		// Cycle to Log, verify localStorage key set, reload, verify still Log.
		await page.keyboard.press('Alt+v');
		await expect.poll(() => currentLayout(page), { timeout: 2_000 }).toBe('log');
		const stored = await page.evaluate(() => localStorage.getItem('ironledger:layout:mode'));
		expect(stored).toBe('log');

		await page.reload();
		await waitForHydrated(page);
		expect(await currentLayout(page)).toBe('log');
	});

	test('Alt+V does not fire while typing in an input', async ({ page }) => {
		// Focus the command-bar text input — always present on /home,
		// plain <input type="text">. Regression guard for the handler's
		// input/textarea/contenteditable check.
		const cmdBar = page.locator('.cb-input').first();
		await expect(cmdBar).toBeVisible({ timeout: 5_000 });
		await cmdBar.focus();
		await page.keyboard.press('Alt+v');
		// Give the handler a moment to (not) fire, then assert unchanged.
		await page.waitForTimeout(150);
		expect(await currentLayout(page)).toBe('grid');
	});
});
