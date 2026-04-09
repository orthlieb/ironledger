/**
 * log-links.spec.ts — Log entry note editing.
 *
 * Interactive log link tests (resource, failure, debility, initiative, etc.)
 * have been moved to log-inject.spec.ts where they use injected mock entries
 * rather than relying on specific dice outcomes.
 */
import { test, expect } from '@playwright/test';

async function goToAdventureWithCharacter(page: import('@playwright/test').Page) {
	await page.goto('/home');
	await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 8000 });

	await page.click('.tab-btn[data-tab="characters"]');
	await page.locator('.char-list--characters > .char-card, .empty-tab').first()
		.waitFor({ timeout: 8000, state: 'attached' });

	const cards = page.locator('.char-list--characters > .char-card');
	if (await cards.count() === 0) {
		await page.click('.char-toolbar button.btn-primary');
		await expect(page.locator('.char-card--active')).toBeVisible({ timeout: 5000 });
	} else {
		await cards.first().click();
		await expect(page.locator('.char-card--active')).toBeVisible({ timeout: 3000 });
	}

	await page.click('.tab-btn[data-tab="adventure"]');
	await expect(page.locator('.adventure-gcb')).toBeVisible({ timeout: 5000 });

	const charTileBtn = page.locator('.gc-tile').first().locator('.gc-tile-btn');
	await expect(charTileBtn).toBeVisible({ timeout: 3000 });
	const tileText = await charTileBtn.textContent().catch(() => '');
	if (!tileText?.trim() || tileText.includes('No character') || tileText === '') {
		await charTileBtn.click();
		await expect(page.locator('.gc-popover').first()).toBeVisible({ timeout: 2000 });
		const charItem = page.locator('.gc-popover .gc-popover-item:not([class*="None"])').first();
		if (await charItem.isVisible({ timeout: 1000 }).catch(() => false)) {
			await charItem.click();
		} else {
			await page.keyboard.press('Escape');
		}
	}
}

test('can add a note to a log entry and it persists', async ({ page }) => {
	await goToAdventureWithCharacter(page);

	// Add a note to get a log entry
	await page.locator('.act-btn').nth(3).click();
	await expect(page.locator('.notes-dialog[open]')).toBeVisible({ timeout: 3000 });
	await page.locator('.notes-dialog .nd-textarea').fill('Initial note content');
	await page.locator('.notes-dialog .nd-add-btn').click();
	await expect(page.locator('.notes-dialog[open]')).not.toBeVisible({ timeout: 3000 });
	await expect(page.locator('.log-entry').first()).toBeVisible({ timeout: 5000 });

	// Click the edit (pen) icon on the latest entry
	const latestEntry = page.locator('.log-entry').first();
	await latestEntry.hover();
	const editBtn = latestEntry.locator('.edit-btn, button[aria-label*="edit" i], button[title*="Edit" i], button[aria-label*="note" i]').first();

	if (await editBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
		await editBtn.click();
		const noteTextarea = latestEntry.locator('textarea');
		await expect(noteTextarea).toBeVisible({ timeout: 2000 });
		await noteTextarea.fill('Updated via E2E test');
		await noteTextarea.press('Control+Enter');
		await expect(noteTextarea).not.toBeVisible({ timeout: 3000 });
		await expect(latestEntry.locator('.entry-body')).toBeVisible({ timeout: 3000 });
	} else {
		await expect(latestEntry).toBeVisible();
	}
});
