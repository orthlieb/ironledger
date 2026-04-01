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
		await expect(page.locator('.char-toolbar button:has-text("+ New Journey")')).toBeVisible({ timeout: 5000 });
	});

	test('shows New Journey and New Site buttons', async ({ page }) => {
		await expect(page.locator('.char-toolbar button:has-text("+ New Journey")')).toBeVisible();
		await expect(page.locator('.char-toolbar button:has-text("+ New Site")')).toBeVisible();
	});

	// ── Journeys ─────────────────────────────────────────────────────────────

	test('clicking New Journey opens the journey dialog', async ({ page }) => {
		await page.click('.char-toolbar button:has-text("+ New Journey")');
		await expect(page.locator('dialog.exp-dialog[open]')).toBeVisible({ timeout: 5000 });
		await expect(page.locator('#new-journey-diff')).toBeVisible();
		await page.keyboard.press('Escape');
	});

	test('can add a journey', async ({ page }) => {
		const expBefore = await page.locator('.char-list--expeditions .char-card').count();
		await page.click('.char-toolbar button:has-text("+ New Journey")');
		await expect(page.locator('dialog.exp-dialog[open]')).toBeVisible({ timeout: 5000 });
		await page.selectOption('#new-journey-diff', 'dangerous');
		await page.locator('dialog.exp-dialog button:has-text("Start Journey")').click();
		await expect(page.locator('.char-list--expeditions .char-card'))
			.not.toHaveCount(expBefore, { timeout: 5000 });
	});

	test('can delete a journey', async ({ page }) => {
		// Ensure at least one journey exists
		let expCards = page.locator('.char-list--expeditions .char-card');
		if (await expCards.count() === 0) {
			await page.click('.char-toolbar button:has-text("+ New Journey")');
			await expect(page.locator('dialog.exp-dialog[open]')).toBeVisible({ timeout: 5000 });
			await page.locator('dialog.exp-dialog button:has-text("Start Journey")').click();
			await expect(expCards).not.toHaveCount(0, { timeout: 5000 });
		}
		const countBefore = await expCards.count();
		await expCards.first().click();
		// JourneyCard uses .jc-del-btn → inline confirm → "Yes" button
		const deleteBtn = page.locator('.jc-del-btn').first();
		await expect(deleteBtn).toBeVisible({ timeout: 3000 });
		await deleteBtn.click();
		// ConfirmDialog modal — click "Remove"
		const confirmBtn = page.locator('dialog.confirm-modal[open] button.btn-danger');
		await expect(confirmBtn).toBeVisible({ timeout: 5000 });
		await confirmBtn.click();
		await expect(expCards).toHaveCount(countBefore - 1, { timeout: 5000 });
	});

	// ── Sites ─────────────────────────────────────────────────────────────────

	test('clicking New Site opens the site dialog', async ({ page }) => {
		await page.click('.char-toolbar button:has-text("+ New Site")');
		await expect(page.locator('dialog.exp-dialog[open]')).toBeVisible({ timeout: 5000 });
		await expect(page.locator('#new-site-diff')).toBeVisible();
		await expect(page.locator('#new-site-theme')).toBeVisible();
		await expect(page.locator('#new-site-domain')).toBeVisible();
		await page.keyboard.press('Escape');
	});

	test('can add a site', async ({ page }) => {
		const expBefore = await page.locator('.char-list--expeditions .char-card').count();
		await page.click('.char-toolbar button:has-text("+ New Site")');
		await expect(page.locator('dialog.exp-dialog[open]')).toBeVisible({ timeout: 5000 });
		await page.selectOption('#new-site-diff',   'formidable');
		await page.selectOption('#new-site-theme',  { index: 1 });
		await page.selectOption('#new-site-domain', { index: 1 });
		await page.locator('dialog.exp-dialog button:has-text("Discover Site")').click();
		await expect(page.locator('.char-list--expeditions .char-card'))
			.not.toHaveCount(expBefore, { timeout: 5000 });
	});

	test('can delete a site', async ({ page }) => {
		let expCards = page.locator('.char-list--expeditions .char-card');
		if (await expCards.count() === 0) {
			await page.click('.char-toolbar button:has-text("+ New Site")');
			await expect(page.locator('dialog.exp-dialog[open]')).toBeVisible({ timeout: 5000 });
			await page.selectOption('#new-site-theme',  { index: 1 });
			await page.selectOption('#new-site-domain', { index: 1 });
			await page.locator('dialog.exp-dialog button:has-text("Discover Site")').click();
			await expect(expCards).not.toHaveCount(0, { timeout: 5000 });
		}
		const countBefore = await expCards.count();
		await expCards.first().click();
		// SiteCard uses .sc-del-btn; JourneyCard uses .jc-del-btn
		const deleteBtn = page.locator('.sc-del-btn, .jc-del-btn').first();
		await expect(deleteBtn).toBeVisible({ timeout: 3000 });
		await deleteBtn.click();
		// ConfirmDialog modal — click "Remove"
		const confirmBtn = page.locator('dialog.confirm-modal[open] button.btn-danger');
		await expect(confirmBtn).toBeVisible({ timeout: 2000 });
		await confirmBtn.click();
		await expect(expCards).toHaveCount(countBefore - 1, { timeout: 5000 });
	});

	// ── Cleanup ───────────────────────────────────────────────────────────────

	test('cleanup: delete all expeditions', async ({ page }) => {
		const cards = page.locator('.char-list--expeditions .char-card');
		let count = await cards.count();
		while (count > 0) {
			await cards.first().click();
			// SiteCard uses .sc-del-btn; JourneyCard uses .jc-del-btn
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
