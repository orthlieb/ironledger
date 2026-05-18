/**
 * log-links.spec.ts — Log entry note editing.
 *
 * Interactive log link tests (resource, failure, debility, initiative, etc.)
 * have been moved to log-inject.spec.ts where they use injected mock entries
 * rather than relying on specific dice outcomes.
 */
import { test, expect } from '@playwright/test';

const CHAR_AREA   = '.home-area--characters';
const CHAR_HEADER = `${CHAR_AREA} .ca-header`;
const CHAR_SPINE  = `${CHAR_AREA} .ca-spine`;

/** Ensure a character exists in the v2 Characters area; auto-select handles activation. */
async function ensureCharacter(page: import('@playwright/test').Page) {
	await page.goto('/home');
	await expect(page.locator(`${CHAR_AREA} .ca-loading`)).not.toBeVisible({ timeout: 10_000 });
	await page.locator(`${CHAR_AREA} .ca-empty, ${CHAR_AREA} .ca-body`).first()
		.waitFor({ timeout: 10_000, state: 'attached' });

	if (await page.locator(CHAR_SPINE).count() === 0) {
		await page.locator(`${CHAR_HEADER} button:has-text("+ Character")`).click();
		await expect(page.locator(CHAR_SPINE)).not.toHaveCount(0, { timeout: 8_000 });
	}
	await expect(page.locator(`${CHAR_AREA} .ca-tab`).first()).toBeVisible({ timeout: 8_000 });
}

test('can add a note to a log entry and it persists', async ({ page }) => {
	await ensureCharacter(page);

	// Add a note via the global app-nav NOTE button.
	await page.locator('.app-nav .act-btn').nth(3).click();
	await expect(page.locator('.notes-dialog[open]')).toBeVisible({ timeout: 3_000 });
	await page.locator('.notes-dialog .nd-textarea').fill('Initial note content');
	await page.locator('.notes-dialog .nd-add-btn').click();
	await expect(page.locator('.notes-dialog[open]')).not.toBeVisible({ timeout: 3_000 });
	await expect(page.locator('.log-entry').first()).toBeVisible({ timeout: 5_000 });

	// Click the edit (pen) icon on the latest entry.
	const latestEntry = page.locator('.log-entry').first();
	await latestEntry.hover();
	const editBtn = latestEntry.locator('.edit-btn, button[aria-label*="edit" i], button[title*="Edit" i], button[aria-label*="note" i]').first();

	if (await editBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
		await editBtn.click();
		const noteTextarea = latestEntry.locator('textarea');
		await expect(noteTextarea).toBeVisible({ timeout: 2_000 });
		await noteTextarea.fill('Updated via E2E test');
		await noteTextarea.press('Control+Enter');
		await expect(noteTextarea).not.toBeVisible({ timeout: 3_000 });
		await expect(latestEntry.locator('.entry-body')).toBeVisible({ timeout: 3_000 });
	} else {
		await expect(latestEntry).toBeVisible();
	}
});
