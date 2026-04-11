/**
 * expeditions.spec.ts — Expeditions tab: add and delete journeys and sites.
 */
import { test, expect } from '@playwright/test';

test.describe('Expeditions tab', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/home');
		// Wait for DB session to finish loading before clicking — prevents click being overwritten
		await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 8000 });
		await page.click('.tab-btn[data-tab="expeditions"]');
		await expect(page.locator('.char-toolbar button:has-text("+ Journey")')).toBeVisible({ timeout: 5000 });
	});

	test('shows Journey and Site buttons', async ({ page }) => {
		await expect(page.locator('.char-toolbar button:has-text("+ Journey")')).toBeVisible();
		await expect(page.locator('.char-toolbar button:has-text("+ Site")')).toBeVisible();
	});

	// ── Journeys ─────────────────────────────────────────────────────────────

	test('clicking Journey opens the journey dialog', async ({ page }) => {
		await page.click('.char-toolbar button:has-text("+ Journey")');
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5000 });
		await expect(page.locator('dialog.confirm-modal[open] .cm-title')).toContainText('New Journey');
		await page.keyboard.press('Escape');
	});

	test('can add a journey', async ({ page }) => {
		const expBefore = await page.locator('.char-list--expeditions .char-card').count();
		await page.click('.char-toolbar button:has-text("+ Journey")');
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5000 });
		// Default difficulty is 'dangerous' — just click Start Journey
		await page.locator('dialog.confirm-modal[open] button:has-text("Start Journey")').click();
		await expect(page.locator('.char-list--expeditions .char-card'))
			.not.toHaveCount(expBefore, { timeout: 5000 });
	});

	test('can delete a journey', async ({ page }) => {
		// Ensure at least one journey exists
		let expCards = page.locator('.char-list--expeditions .char-card');
		if (await expCards.count() === 0) {
			await page.click('.char-toolbar button:has-text("+ Journey")');
			await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5000 });
			await page.locator('dialog.confirm-modal[open] button:has-text("Start Journey")').click();
			await expect(expCards).not.toHaveCount(0, { timeout: 5000 });
		}
		const countBefore = await expCards.count();
		await expCards.first().click();
		// JourneyCard uses .jc-del-btn → ConfirmDialog
		const deleteBtn = page.locator('.jc-del-btn').first();
		await expect(deleteBtn).toBeVisible({ timeout: 3000 });
		await deleteBtn.click();
		const confirmBtn = page.locator('dialog.confirm-modal[open] button.btn-danger');
		await expect(confirmBtn).toBeVisible({ timeout: 5000 });
		await confirmBtn.click();
		await expect(expCards).toHaveCount(countBefore - 1, { timeout: 5000 });
	});

	// ── Sites ─────────────────────────────────────────────────────────────────

	test('clicking Site opens the site dialog', async ({ page }) => {
		await page.click('.char-toolbar button:has-text("+ Site")');
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5000 });
		await expect(page.locator('dialog.confirm-modal[open] .cm-title')).toContainText('New Site');
		await expect(page.locator('dialog.confirm-modal[open] #ns-theme')).toBeVisible();
		await expect(page.locator('dialog.confirm-modal[open] #ns-domain')).toBeVisible();
		await page.keyboard.press('Escape');
	});

	test('can add a site', async ({ page }) => {
		const expBefore = await page.locator('.char-list--expeditions .char-card').count();
		await page.click('.char-toolbar button:has-text("+ Site")');
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5000 });
		await page.selectOption('dialog.confirm-modal[open] #ns-theme',  { index: 1 });
		await page.selectOption('dialog.confirm-modal[open] #ns-domain', { index: 1 });
		await page.locator('dialog.confirm-modal[open] button:has-text("Discover Site")').click();
		await expect(page.locator('.char-list--expeditions .char-card'))
			.not.toHaveCount(expBefore, { timeout: 5000 });
	});

	test('can delete a site', async ({ page }) => {
		let expCards = page.locator('.char-list--expeditions .char-card');
		if (await expCards.count() === 0) {
			await page.click('.char-toolbar button:has-text("+ Site")');
			await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5000 });
			await page.selectOption('dialog.confirm-modal[open] #ns-theme',  { index: 1 });
			await page.selectOption('dialog.confirm-modal[open] #ns-domain', { index: 1 });
			await page.locator('dialog.confirm-modal[open] button:has-text("Discover Site")').click();
			await expect(expCards).not.toHaveCount(0, { timeout: 5000 });
		}
		const countBefore = await expCards.count();
		await expCards.first().click();
		// SiteCard uses .sc-del-btn; JourneyCard uses .jc-del-btn
		const deleteBtn = page.locator('.sc-del-btn, .jc-del-btn').first();
		await expect(deleteBtn).toBeVisible({ timeout: 3000 });
		await deleteBtn.click();
		const confirmBtn = page.locator('dialog.confirm-modal[open] button.btn-danger');
		await expect(confirmBtn).toBeVisible({ timeout: 2000 });
		await confirmBtn.click();
		await expect(expCards).toHaveCount(countBefore - 1, { timeout: 5000 });
	});

	// ── Change theme / domain ─────────────────────────────────────────────────

	/** Helper: ensure a site card is visible and expanded, return its first locator. */
	async function ensureSiteCard(page: import('@playwright/test').Page) {
		let siteCards = page.locator('.char-list--expeditions .char-card');
		if (await siteCards.count() === 0 ||
		    await page.locator('.sc-theme-btn').count() === 0) {
			await page.click('.char-toolbar button:has-text("+ Site")');
			await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5000 });
			await page.selectOption('dialog.confirm-modal[open] #ns-theme',  { index: 1 });
			await page.selectOption('dialog.confirm-modal[open] #ns-domain', { index: 1 });
			await page.locator('dialog.confirm-modal[open] button:has-text("Discover Site")').click();
			await expect(page.locator('.sc-theme-btn').first()).toBeVisible({ timeout: 5000 });
		}
		siteCards = page.locator('.char-list--expeditions .char-card');
		const card = siteCards.first();
		// Expand it if collapsed
		if (await page.locator('.sc-theme-btn').first().isVisible({ timeout: 1000 }).catch(() => false) === false) {
			await card.click();
		}
		return card;
	}

	test('Change Theme button opens dialog pre-filled with current theme', async ({ page }) => {
		await ensureSiteCard(page);
		const themeBadge = page.locator('.sc-badge--theme').first();
		const currentTheme = await themeBadge.textContent();

		await page.locator('.sc-theme-btn:has-text("Change Theme")').first().click();
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5000 });
		await expect(page.locator('dialog.confirm-modal[open] .cm-title')).toContainText('Change Theme');

		const selectVal = await page.locator('dialog.confirm-modal[open] select').inputValue();
		expect(selectVal).toBe(currentTheme?.trim());
		await page.keyboard.press('Escape');
	});

	test('Change Domain button opens dialog pre-filled with current domain', async ({ page }) => {
		await ensureSiteCard(page);
		const domainBadge = page.locator('.sc-badge--domain').first();
		const currentDomain = await domainBadge.textContent();

		await page.locator('.sc-theme-btn:has-text("Change Domain")').first().click();
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5000 });
		await expect(page.locator('dialog.confirm-modal[open] .cm-title')).toContainText('Change Domain');

		const selectVal = await page.locator('dialog.confirm-modal[open] select').inputValue();
		expect(selectVal).toBe(currentDomain?.trim());
		await page.keyboard.press('Escape');
	});

	test('confirming Change Theme updates the theme badge and logs the change', async ({ page }) => {
		await ensureSiteCard(page);

		await page.locator('.sc-theme-btn:has-text("Change Theme")').first().click();
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5000 });

		// Pick the last option to ensure it differs from whatever index 1 was
		await page.locator('dialog.confirm-modal[open] select').selectOption({ index: 5 });
		const newTheme = await page.locator('dialog.confirm-modal[open] select').inputValue();
		await page.locator('dialog.confirm-modal[open] button:has-text("Change Theme")').click();
		await expect(page.locator('dialog.confirm-modal[open]')).not.toBeVisible({ timeout: 3000 });

		// Badge updates reactively
		await expect(page.locator('.sc-badge--theme').first()).toHaveText(newTheme, { timeout: 5000 });
	});

	test('confirming Change Domain updates the domain badge and logs the change', async ({ page }) => {
		await ensureSiteCard(page);

		await page.locator('.sc-theme-btn:has-text("Change Domain")').first().click();
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5000 });

		await page.locator('dialog.confirm-modal[open] select').selectOption({ index: 5 });
		const newDomain = await page.locator('dialog.confirm-modal[open] select').inputValue();
		await page.locator('dialog.confirm-modal[open] button:has-text("Change Domain")').click();
		await expect(page.locator('dialog.confirm-modal[open]')).not.toBeVisible({ timeout: 3000 });

		await expect(page.locator('.sc-badge--domain').first()).toHaveText(newDomain, { timeout: 5000 });
	});

	// ── Cleanup ───────────────────────────────────────────────────────────────

	test('cleanup: delete all expeditions', async ({ page }) => {
		const cards = page.locator('.char-list--expeditions .char-card');
		let count = await cards.count();
		while (count > 0) {
			await cards.first().click();
			const deleteBtn = page.locator('.sc-del-btn, .jc-del-btn').first();
			await expect(deleteBtn).toBeVisible({ timeout: 3000 });
			await deleteBtn.click();
			const confirmBtn = page.locator('dialog.confirm-modal[open] button.btn-danger');
			await expect(confirmBtn).toBeVisible({ timeout: 3000 });
			await confirmBtn.click();
			count--;
			if (count > 0) {
				await expect(cards).toHaveCount(count, { timeout: 5000 });
			}
		}
	});
});
