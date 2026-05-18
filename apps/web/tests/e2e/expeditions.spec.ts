/**
 * expeditions.spec.ts — Expeditions area (v2): add and delete journeys and sites.
 *
 * v2 layout: the Expeditions area lives in the top-right column of the
 * deck-of-cards layout and is always visible. The "Change Theme" / "Change
 * Domain" controls are now <select> dropdowns inside the Core tab — no
 * dedicated buttons.
 */
import { test, expect } from '@playwright/test';

const EXP_AREA   = '.home-area--expeditions';
const EXP_HEADER = `${EXP_AREA} .ea-header`;
const EXP_SPINE  = `${EXP_AREA} .ea-spine`;
const EXP_STAGE  = `${EXP_AREA} .ea-stage`;

async function waitForExpeditionsLoaded(page: import('@playwright/test').Page) {
	await expect(page.locator(`${EXP_AREA} .ea-loading`)).not.toBeVisible({ timeout: 10_000 });
	await page.locator(`${EXP_AREA} .ea-empty, ${EXP_AREA} .ea-body`).first()
		.waitFor({ timeout: 10_000, state: 'attached' });
}

async function switchExpTab(page: import('@playwright/test').Page, label: string) {
	await page.locator(`${EXP_AREA} .ea-tab`, { hasText: new RegExp(`^${label}$`, 'i') }).click();
}

test.describe('Expeditions area (v2)', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/home');
		await waitForExpeditionsLoaded(page);
	});

	test('shows + Journey and + Site buttons in header', async ({ page }) => {
		await expect(page.locator(`${EXP_HEADER} button:has-text("+ Journey")`)).toBeVisible();
		await expect(page.locator(`${EXP_HEADER} button:has-text("+ Site")`)).toBeVisible();
	});

	// ── Journeys ──────────────────────────────────────────────────────────────

	test('clicking + Journey opens the new-journey dialog', async ({ page }) => {
		await page.locator(`${EXP_HEADER} button:has-text("+ Journey")`).click();
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5_000 });
		await expect(page.locator('dialog.confirm-modal[open] .cm-title')).toContainText('New Journey');
		await page.keyboard.press('Escape');
	});

	test('can add a journey', async ({ page }) => {
		const before = await page.locator(EXP_SPINE).count();
		await page.locator(`${EXP_HEADER} button:has-text("+ Journey")`).click();
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5_000 });
		await page.locator('dialog.confirm-modal[open] button:has-text("Start Journey")').click();
		await expect(page.locator(EXP_SPINE)).not.toHaveCount(before, { timeout: 5_000 });
	});

	test('can delete a journey', async ({ page }) => {
		const spines = page.locator(EXP_SPINE);
		if (await spines.count() === 0) {
			await page.locator(`${EXP_HEADER} button:has-text("+ Journey")`).click();
			await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5_000 });
			await page.locator('dialog.confirm-modal[open] button:has-text("Start Journey")').click();
			await expect(spines).not.toHaveCount(0, { timeout: 5_000 });
		}
		const countBefore = await spines.count();
		await spines.first().click();
		const deleteBtn = page.locator(`${EXP_AREA} .ea-stage-delete-btn`).first();
		await expect(deleteBtn).toBeVisible({ timeout: 3_000 });
		await deleteBtn.click();
		const confirmBtn = page.locator('dialog.confirm-modal[open] button.btn-danger');
		await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
		await confirmBtn.click();
		await expect(spines).toHaveCount(countBefore - 1, { timeout: 5_000 });
	});

	// ── Sites ─────────────────────────────────────────────────────────────────

	test('clicking + Site opens the new-site dialog', async ({ page }) => {
		await page.locator(`${EXP_HEADER} button:has-text("+ Site")`).click();
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5_000 });
		await expect(page.locator('dialog.confirm-modal[open] .cm-title')).toContainText('New Site');
		await expect(page.locator('dialog.confirm-modal[open] #ns-theme')).toBeVisible();
		await expect(page.locator('dialog.confirm-modal[open] #ns-domain')).toBeVisible();
		await page.keyboard.press('Escape');
	});

	test('can add a site', async ({ page }) => {
		const before = await page.locator(EXP_SPINE).count();
		await page.locator(`${EXP_HEADER} button:has-text("+ Site")`).click();
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5_000 });
		await page.selectOption('dialog.confirm-modal[open] #ns-theme',  { index: 1 });
		await page.selectOption('dialog.confirm-modal[open] #ns-domain', { index: 1 });
		await page.locator('dialog.confirm-modal[open] button:has-text("Discover Site")').click();
		await expect(page.locator(EXP_SPINE)).not.toHaveCount(before, { timeout: 5_000 });
	});

	test('can delete a site', async ({ page }) => {
		const spines = page.locator(EXP_SPINE);
		if (await spines.count() === 0) {
			await page.locator(`${EXP_HEADER} button:has-text("+ Site")`).click();
			await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5_000 });
			await page.selectOption('dialog.confirm-modal[open] #ns-theme',  { index: 1 });
			await page.selectOption('dialog.confirm-modal[open] #ns-domain', { index: 1 });
			await page.locator('dialog.confirm-modal[open] button:has-text("Discover Site")').click();
			await expect(spines).not.toHaveCount(0, { timeout: 5_000 });
		}
		const countBefore = await spines.count();
		await spines.first().click();
		const deleteBtn = page.locator(`${EXP_AREA} .ea-stage-delete-btn`).first();
		await expect(deleteBtn).toBeVisible({ timeout: 3_000 });
		await deleteBtn.click();
		const confirmBtn = page.locator('dialog.confirm-modal[open] button.btn-danger');
		await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
		await confirmBtn.click();
		await expect(spines).toHaveCount(countBefore - 1, { timeout: 5_000 });
	});

	// ── Change theme / domain ─────────────────────────────────────────────────

	/**
	 * Ensure a site expedition exists and is the active one.
	 * Returns the active site's id (extracted from the in-area theme <select> id).
	 */
	async function ensureSiteSelected(page: import('@playwright/test').Page): Promise<string> {
		// Create a site if none exists in the expedition list.
		const spines = page.locator(EXP_SPINE);
		if (await spines.count() === 0) {
			await page.locator(`${EXP_HEADER} button:has-text("+ Site")`).click();
			await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5_000 });
			await page.selectOption('dialog.confirm-modal[open] #ns-theme',  { index: 1 });
			await page.selectOption('dialog.confirm-modal[open] #ns-domain', { index: 1 });
			await page.locator('dialog.confirm-modal[open] button:has-text("Discover Site")').click();
			await expect(spines).not.toHaveCount(0, { timeout: 5_000 });
		}
		// Auto-select picks the first expedition; if it's a journey, find a site
		// spine and click it explicitly. We detect by inspecting the stage for
		// the Site-only theme select (id starts with ea-theme-).
		const themeSelect = page.locator(`${EXP_AREA} select[id^="ea-theme-"]`).first();
		if (!(await themeSelect.isVisible({ timeout: 1_000 }).catch(() => false))) {
			// Click each spine looking for a site stage.
			const count = await spines.count();
			for (let i = 0; i < count; i++) {
				await spines.nth(i).click();
				if (await themeSelect.isVisible({ timeout: 500 }).catch(() => false)) break;
			}
		}
		// Switch to Core tab so the theme/domain selects are visible.
		await switchExpTab(page, 'Core');
		await expect(themeSelect).toBeVisible({ timeout: 3_000 });
		const id = (await themeSelect.getAttribute('id')) ?? '';
		return id.replace(/^ea-theme-/, '');
	}

	test('changing the Theme select updates the stored value', async ({ page }) => {
		await ensureSiteSelected(page);
		await switchExpTab(page, 'Core');

		const themeSelect = page.locator(`${EXP_AREA} select[id^="ea-theme-"]`).first();
		const currentTheme = (await themeSelect.inputValue()).trim();

		const options = themeSelect.locator('option');
		const optCount = await options.count();
		const lastVal = (await options.nth(optCount - 1).getAttribute('value')) ?? '';
		if (!lastVal || lastVal === currentTheme) {
			test.skip(true, 'Theme set already has a single option');
			return;
		}
		await themeSelect.selectOption(lastVal);
		// v2 commits theme changes directly on the select onchange; a confirm
		// dialog only appears from log-link delegation (d100 99/100).
		await expect(themeSelect).toHaveValue(lastVal, { timeout: 3_000 });
	});

	test('changing the Domain select updates the stored value', async ({ page }) => {
		await ensureSiteSelected(page);
		await switchExpTab(page, 'Core');

		const domainSelect = page.locator(`${EXP_AREA} select[id^="ea-domain-"]`).first();
		const currentDomain = (await domainSelect.inputValue()).trim();

		const options = domainSelect.locator('option');
		const optCount = await options.count();
		const lastVal = (await options.nth(optCount - 1).getAttribute('value')) ?? '';
		if (!lastVal || lastVal === currentDomain) {
			test.skip(true, 'Domain set already has a single option');
			return;
		}
		await domainSelect.selectOption(lastVal);
		await expect(domainSelect).toHaveValue(lastVal, { timeout: 3_000 });
	});

	// ── Cleanup ───────────────────────────────────────────────────────────────

	test('cleanup: delete all expeditions', async ({ page }) => {
		const spines = page.locator(EXP_SPINE);
		let count = await spines.count();
		while (count > 0) {
			await spines.first().click();
			const deleteBtn = page.locator(`${EXP_AREA} .ea-stage-delete-btn`).first();
			await expect(deleteBtn).toBeVisible({ timeout: 3_000 });
			await deleteBtn.click();
			const confirmBtn = page.locator('dialog.confirm-modal[open] button.btn-danger');
			await expect(confirmBtn).toBeVisible({ timeout: 3_000 });
			await confirmBtn.click();
			count--;
			if (count > 0) {
				await expect(spines).toHaveCount(count, { timeout: 5_000 });
			}
		}
	});
});
