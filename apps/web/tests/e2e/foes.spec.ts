/**
 * foes.spec.ts — Foes tab: add and delete a foe.
 */
import { test, expect } from '@playwright/test';

/**
 * Add a foe via the two-step picker flow:
 * 1. Click the first .fd-tile → switches to confirm view
 * 2. Click "Add to Foes" → closes dialog
 */
async function addFoeFromPicker(page: import('@playwright/test').Page) {
	const foeTile = page.locator('dialog.foe-dialog .fd-tile').first();
	await expect(foeTile).toBeVisible({ timeout: 8000 });
	await foeTile.click();
	// Confirm view: click "Add to Foes"
	const addBtn = page.locator('dialog.foe-dialog button:has-text("Add to Foes")');
	await expect(addBtn).toBeVisible({ timeout: 3000 });
	await addBtn.click();
	await expect(page.locator('dialog.foe-dialog[open]')).not.toBeVisible({ timeout: 5000 });
}

test.describe('Foes tab', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/home');
		// Wait for DB session to finish loading before clicking — prevents click being overwritten
		await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 8000 });
		await page.click('.tab-btn[data-tab="foes"]');
		await expect(page.locator('.char-toolbar button:has-text("+ Foe")')).toBeVisible({ timeout: 5000 });
	});

	test('shows toolbar with New Foe button', async ({ page }) => {
		await expect(page.locator('.char-toolbar button.btn-primary').first()).toBeVisible();
	});

	test('clicking New Foe opens foe picker dialog', async ({ page }) => {
		await page.click('.char-toolbar button.btn-primary');
		await expect(page.locator('dialog.foe-dialog[open]')).toBeVisible({ timeout: 5000 });
		await page.keyboard.press('Escape');
	});

	test('can add a foe from the picker', async ({ page }) => {
		const foesBefore = await page.locator('.char-list--foes .char-card').count();
		await page.click('.char-toolbar button.btn-primary');
		await expect(page.locator('dialog.foe-dialog[open]')).toBeVisible({ timeout: 5000 });
		await addFoeFromPicker(page);
		await expect(page.locator('.char-list--foes .char-card'))
			.not.toHaveCount(foesBefore, { timeout: 5000 });
	});

	test('clicking a foe card selects it', async ({ page }) => {
		let foeCards = page.locator('.char-list--foes .char-card');
		if (await foeCards.count() === 0) {
			await page.click('.char-toolbar button.btn-primary');
			await expect(page.locator('dialog.foe-dialog[open]')).toBeVisible({ timeout: 5000 });
			await addFoeFromPicker(page);
			await expect(foeCards).not.toHaveCount(0, { timeout: 5000 });
		}
		await foeCards.first().click();
		await expect(foeCards.first()).toHaveClass(/char-card--active/);
	});

	test('selected foe shows foe card details', async ({ page }) => {
		let foeCards = page.locator('.char-list--foes .char-card');
		if (await foeCards.count() === 0) {
			await page.click('.char-toolbar button.btn-primary');
			await expect(page.locator('dialog.foe-dialog[open]')).toBeVisible({ timeout: 5000 });
			await addFoeFromPicker(page);
			await expect(foeCards).not.toHaveCount(0, { timeout: 5000 });
		}
		await foeCards.first().click();
		await expect(page.locator('.fc-header')).toBeVisible({ timeout: 3000 });
	});

	test('can delete a foe', async ({ page }) => {
		let foeCards = page.locator('.char-list--foes .char-card');
		if (await foeCards.count() === 0) {
			await page.click('.char-toolbar button.btn-primary');
			await expect(page.locator('dialog.foe-dialog[open]')).toBeVisible({ timeout: 5000 });
			await addFoeFromPicker(page);
			await expect(foeCards).not.toHaveCount(0, { timeout: 5000 });
		}
		const countBefore = await foeCards.count();
		await foeCards.first().click();
		await expect(page.locator('.fc-header')).toBeVisible({ timeout: 3000 });
		// FoeCard uses .fc-del-btn → opens ConfirmDialog → click "Remove"
		const deleteBtn = page.locator('.fc-del-btn').first();
		await expect(deleteBtn).toBeVisible({ timeout: 2000 });
		await deleteBtn.click();
		// ConfirmDialog modal appears — click "Remove"
		const confirmBtn = page.locator('dialog.confirm-modal[open] button.btn-danger');
		await expect(confirmBtn).toBeVisible({ timeout: 2000 });
		await confirmBtn.click();
		await expect(foeCards).toHaveCount(countBefore - 1, { timeout: 5000 });
	});

	// ── Cleanup ───────────────────────────────────────────────────────────────

	test('cleanup: delete all foes', async ({ page }) => {
		const cards = page.locator('.char-list--foes .char-card');
		let count = await cards.count();
		while (count > 0) {
			await cards.first().click();
			await expect(page.locator('.fc-del-btn').first()).toBeVisible({ timeout: 3000 });
			await page.locator('.fc-del-btn').first().click();
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
