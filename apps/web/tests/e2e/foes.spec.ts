/**
 * foes.spec.ts — Foes area (v2): add and delete a foe.
 *
 * v2 layout: the Foes area lives in the bottom-left of the deck-of-cards
 * layout and is always visible. No tab switching is needed.
 */
import { test, expect } from '@playwright/test';

const FOE_AREA   = '.home-area--foes';
const FOE_HEADER = `${FOE_AREA} .fa-header`;
const FOE_SPINE  = `${FOE_AREA} .fa-spine`;
const FOE_STAGE  = `${FOE_AREA} .fa-stage`;

async function waitForFoesLoaded(page: import('@playwright/test').Page) {
	await expect(page.locator(`${FOE_AREA} .fa-loading`)).not.toBeVisible({ timeout: 10_000 });
	await page.locator(`${FOE_AREA} .fa-empty, ${FOE_AREA} .fa-body`).first()
		.waitFor({ timeout: 10_000, state: 'attached' });
}

/**
 * Add a foe via the two-step picker flow:
 * 1. Click the first .fd-tile → switches to confirm view
 * 2. Click "Add to Foes" → closes dialog
 */
async function addFoeFromPicker(page: import('@playwright/test').Page) {
	const foeTile = page.locator('dialog.foe-dialog .fd-tile').first();
	await expect(foeTile).toBeVisible({ timeout: 8_000 });
	await foeTile.click();
	const addBtn = page.locator('dialog.foe-dialog button:has-text("Add to Foes")');
	await expect(addBtn).toBeVisible({ timeout: 3_000 });
	await addBtn.click();
	await expect(page.locator('dialog.foe-dialog[open]')).not.toBeVisible({ timeout: 5_000 });
}

test.describe('Foes area (v2)', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/home');
		await waitForFoesLoaded(page);
	});

	test('shows header with + Foe button', async ({ page }) => {
		await expect(page.locator(`${FOE_HEADER} button:has-text("+ Foe")`)).toBeVisible();
	});

	test('clicking + Foe opens foe picker dialog', async ({ page }) => {
		await page.locator(`${FOE_HEADER} button:has-text("+ Foe")`).click();
		await expect(page.locator('dialog.foe-dialog[open]')).toBeVisible({ timeout: 5_000 });
		await page.keyboard.press('Escape');
	});

	test('can add a foe from the picker', async ({ page }) => {
		const before = await page.locator(FOE_SPINE).count();
		await page.locator(`${FOE_HEADER} button:has-text("+ Foe")`).click();
		await expect(page.locator('dialog.foe-dialog[open]')).toBeVisible({ timeout: 5_000 });
		await addFoeFromPicker(page);
		await expect(page.locator(FOE_SPINE)).not.toHaveCount(before, { timeout: 5_000 });
	});

	test('clicking a foe spine selects it', async ({ page }) => {
		const spines = page.locator(FOE_SPINE);
		if (await spines.count() === 0) {
			await page.locator(`${FOE_HEADER} button:has-text("+ Foe")`).click();
			await expect(page.locator('dialog.foe-dialog[open]')).toBeVisible({ timeout: 5_000 });
			await addFoeFromPicker(page);
			await expect(spines).not.toHaveCount(0, { timeout: 5_000 });
		}
		await spines.first().click();
		await expect(spines.first()).toHaveClass(/fa-spine--active/);
	});

	test('selected foe shows stage with foe details', async ({ page }) => {
		const spines = page.locator(FOE_SPINE);
		if (await spines.count() === 0) {
			await page.locator(`${FOE_HEADER} button:has-text("+ Foe")`).click();
			await expect(page.locator('dialog.foe-dialog[open]')).toBeVisible({ timeout: 5_000 });
			await addFoeFromPicker(page);
			await expect(spines).not.toHaveCount(0, { timeout: 5_000 });
		}
		await spines.first().click();
		await expect(page.locator(`${FOE_AREA} .fa-stage-name`)).toBeVisible({ timeout: 3_000 });
	});

	test('can delete a foe', async ({ page }) => {
		const spines = page.locator(FOE_SPINE);
		if (await spines.count() === 0) {
			await page.locator(`${FOE_HEADER} button:has-text("+ Foe")`).click();
			await expect(page.locator('dialog.foe-dialog[open]')).toBeVisible({ timeout: 5_000 });
			await addFoeFromPicker(page);
			await expect(spines).not.toHaveCount(0, { timeout: 5_000 });
		}
		const countBefore = await spines.count();
		await spines.first().click();
		const deleteBtn = page.locator(`${FOE_AREA} .fa-stage-delete-btn`).first();
		await expect(deleteBtn).toBeVisible({ timeout: 3_000 });
		await deleteBtn.click();
		const confirmBtn = page.locator('dialog.confirm-modal[open] button.btn-danger');
		await expect(confirmBtn).toBeVisible({ timeout: 3_000 });
		await confirmBtn.click();
		await expect(spines).toHaveCount(countBefore - 1, { timeout: 5_000 });
	});

	// ── Cleanup ───────────────────────────────────────────────────────────────

	test('cleanup: delete all foes', async ({ page }) => {
		const spines = page.locator(FOE_SPINE);
		let count = await spines.count();
		while (count > 0) {
			await spines.first().click();
			const deleteBtn = page.locator(`${FOE_AREA} .fa-stage-delete-btn`).first();
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
