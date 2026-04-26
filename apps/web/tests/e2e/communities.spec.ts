/**
 * communities.spec.ts — Communities tab: add and delete communities and NPCs.
 */
import { test, expect } from '@playwright/test';

test.describe('Communities tab', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/home');
		// Wait for DB session to finish loading
		await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 8000 });
		await page.click('.tab-btn[data-tab="communities"]');
		await expect(page.locator('.char-toolbar button:has-text("+ Community")')).toBeVisible({ timeout: 5000 });
	});

	test('shows Community and NPC buttons', async ({ page }) => {
		await expect(page.locator('.char-toolbar button:has-text("+ Community")')).toBeVisible();
		await expect(page.locator('.char-toolbar button:has-text("+ NPC")')).toBeVisible();
	});

	// ── Communities ──────────────────────────────────────────────────────────

	test('clicking Community opens the random-generation dialog', async ({ page }) => {
		await page.click('.char-toolbar button:has-text("+ Community")');
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5000 });
		await expect(page.locator('dialog.confirm-modal[open] .cm-title')).toContainText('New Community');
		await page.keyboard.press('Escape');
	});

	test('can add a community via Generate Randomly', async ({ page }) => {
		const before = await page.locator('.char-list--communities .char-card').count();
		await page.click('.char-toolbar button:has-text("+ Community")');
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5000 });
		await page.locator('dialog.confirm-modal[open] button:has-text("Generate Randomly")').click();
		await expect(page.locator('.char-list--communities .char-card'))
			.not.toHaveCount(before, { timeout: 5000 });
	});

	test('can add a community via Create Manually', async ({ page }) => {
		const before = await page.locator('.char-list--communities .char-card').count();
		await page.click('.char-toolbar button:has-text("+ Community")');
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5000 });
		await page.locator('dialog.confirm-modal[open] button:has-text("Create Manually")').click();
		await expect(page.locator('dialog.confirm-modal[open]')).not.toBeVisible({ timeout: 3000 });
		await expect(page.locator('.char-list--communities .char-card'))
			.toHaveCount(before + 1, { timeout: 5000 });
	});

	test('Escape closes the dialog without creating', async ({ page }) => {
		const before = await page.locator('.char-list--communities .char-card').count();
		await page.click('.char-toolbar button:has-text("+ Community")');
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5000 });
		await page.keyboard.press('Escape');
		await expect(page.locator('dialog.confirm-modal[open]')).not.toBeVisible({ timeout: 3000 });
		await expect(page.locator('.char-list--communities .char-card')).toHaveCount(before);
	});

	test('can delete a community', async ({ page }) => {
		let cards = page.locator('.char-list--communities .char-card');
		if (await cards.count() === 0) {
			await page.click('.char-toolbar button:has-text("+ Community")');
			await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5000 });
			await page.locator('dialog.confirm-modal[open] button:has-text("Generate Randomly")').click();
			await expect(cards).not.toHaveCount(0, { timeout: 5000 });
		}
		const countBefore = await cards.count();
		const deleteBtn = page.locator('.cc-del-btn').first();
		await expect(deleteBtn).toBeVisible({ timeout: 3000 });
		await deleteBtn.click();
		const confirmBtn = page.locator('dialog.confirm-modal[open] button.btn-danger');
		await expect(confirmBtn).toBeVisible({ timeout: 3000 });
		await confirmBtn.click();
		await expect(cards).toHaveCount(countBefore - 1, { timeout: 5000 });
	});

	// ── NPCs ─────────────────────────────────────────────────────────────────

	test('clicking NPC opens the random-generation dialog', async ({ page }) => {
		await page.click('.char-toolbar button:has-text("+ NPC")');
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5000 });
		await expect(page.locator('dialog.confirm-modal[open] .cm-title')).toContainText('New NPC');
		await page.keyboard.press('Escape');
	});

	test('can add an NPC via Generate Randomly', async ({ page }) => {
		const before = await page.locator('.char-list--communities .char-card:has(.nc-card)').count();
		await page.click('.char-toolbar button:has-text("+ NPC")');
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5000 });
		await page.locator('dialog.confirm-modal[open] button:has-text("Generate Randomly")').click();
		await expect(page.locator('.char-list--communities .char-card:has(.nc-card)'))
			.not.toHaveCount(before, { timeout: 5000 });
	});

	test('can add an NPC via Create Manually', async ({ page }) => {
		const before = await page.locator('.char-list--communities .char-card:has(.nc-card)').count();
		await page.click('.char-toolbar button:has-text("+ NPC")');
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5000 });
		await page.locator('dialog.confirm-modal[open] button:has-text("Create Manually")').click();
		await expect(page.locator('dialog.confirm-modal[open]')).not.toBeVisible({ timeout: 3000 });
		await expect(page.locator('.char-list--communities .char-card:has(.nc-card)'))
			.toHaveCount(before + 1, { timeout: 5000 });
	});

	test('NPC Escape closes the dialog without creating', async ({ page }) => {
		const before = await page.locator('.char-list--communities .char-card:has(.nc-card)').count();
		await page.click('.char-toolbar button:has-text("+ NPC")');
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5000 });
		await page.keyboard.press('Escape');
		await expect(page.locator('dialog.confirm-modal[open]')).not.toBeVisible({ timeout: 3000 });
		await expect(page.locator('.char-list--communities .char-card:has(.nc-card)')).toHaveCount(before);
	});

	test('can delete an NPC', async ({ page }) => {
		let cards = page.locator('.char-list--communities .char-card:has(.nc-card)');
		if (await cards.count() === 0) {
			await page.click('.char-toolbar button:has-text("+ NPC")');
			await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5000 });
			await page.locator('dialog.confirm-modal[open] button:has-text("Generate Randomly")').click();
			await expect(cards).not.toHaveCount(0, { timeout: 5000 });
		}
		const countBefore = await cards.count();
		const deleteBtn = page.locator('.nc-del-btn').first();
		await expect(deleteBtn).toBeVisible({ timeout: 3000 });
		await deleteBtn.click();
		const confirmBtn = page.locator('dialog.confirm-modal[open] button.btn-danger');
		await expect(confirmBtn).toBeVisible({ timeout: 3000 });
		await confirmBtn.click();
		await expect(cards).toHaveCount(countBefore - 1, { timeout: 5000 });
	});

	// ── Cleanup ───────────────────────────────────────────────────────────────

	test('cleanup: delete all communities and NPCs', async ({ page }) => {
		// Delete all communities first
		let communityCards = page.locator('.char-list--communities .char-card:has(.cc-card)');
		let count = await communityCards.count();
		while (count > 0) {
			await page.locator('.cc-del-btn').first().click();
			const confirmBtn = page.locator('dialog.confirm-modal[open] button.btn-danger');
			await expect(confirmBtn).toBeVisible({ timeout: 3000 });
			await confirmBtn.click();
			count--;
			if (count > 0) {
				await expect(communityCards).toHaveCount(count, { timeout: 5000 });
			}
		}
		// Then delete all NPCs
		let npcCards = page.locator('.char-list--communities .char-card:has(.nc-card)');
		count = await npcCards.count();
		while (count > 0) {
			await page.locator('.nc-del-btn').first().click();
			const confirmBtn = page.locator('dialog.confirm-modal[open] button.btn-danger');
			await expect(confirmBtn).toBeVisible({ timeout: 3000 });
			await confirmBtn.click();
			count--;
			if (count > 0) {
				await expect(npcCards).toHaveCount(count, { timeout: 5000 });
			}
		}
	});
});
