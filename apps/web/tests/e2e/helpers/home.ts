/**
 * helpers/home.ts — shared v2 home-page test helpers.
 *
 * The v2 areas use header **combobox switchers** (not spine lists) with
 * "+ New …" actions and name-first dialogs. Interactions fired mid-hydration
 * are unreliable, so tests should `settleHome()` after navigating before
 * clicking a combobox trigger.
 */
import { expect, type Page } from '@playwright/test';

const CHAR_AREA = '.home-area--characters';

/** Wait for the home page's initial store loads + hydration to settle. */
export async function settleHome(page: Page): Promise<void> {
	await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
}

/** True once a character is active (its sub-tabs have rendered). */
export async function hasActiveCharacter(page: Page): Promise<boolean> {
	return page
		.locator(`${CHAR_AREA} .ca-tab`)
		.first()
		.isVisible()
		.catch(() => false);
}

/** Live character count, read from the header (`data-char-count`). */
export async function characterCount(page: Page): Promise<number> {
	const raw = await page.locator(`${CHAR_AREA} .ca-header-actions`).getAttribute('data-char-count');
	return Number(raw ?? '0');
}

/** Active character's display name (the combobox trigger value). */
export async function activeCharacterName(page: Page): Promise<string> {
	return (
		await page.locator(`${CHAR_AREA} .ca-hdr-combobox .mp-combobox-value`).innerText()
	).trim();
}

/** Open the character switcher and select the Nth listed character. */
export async function selectCharacterByIndex(page: Page, index: number): Promise<void> {
	await page.locator(`${CHAR_AREA} .ca-hdr-combobox`).click();
	const items = page.locator('.mp-cmd-popover .mp-cmd-item:not(.mp-cmd-item--action)');
	await expect(items.first()).toBeVisible({ timeout: 3_000 });
	await items.nth(index).click();
	await expect(page.locator('.mp-cmd-popover'))
		.toBeHidden({ timeout: 3_000 })
		.catch(() => {});
}

/**
 * Create a character via the header combobox → "+ New character…" → name
 * dialog (blank name → "New Character"). Always creates a new one.
 */
export async function createCharacter(page: Page): Promise<void> {
	const before = await characterCount(page);
	await page.locator(`${CHAR_AREA} .ca-hdr-combobox`).click();
	await page.locator('.mp-cmd-item--action', { hasText: /New character/i }).click();
	await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 5_000 });
	// Name-first dialog: the Create button is disabled until a name is entered.
	await page.locator('.confirm-modal .co-input').fill('E2E Character');
	await page.locator('.confirm-modal .btn-primary').click();
	await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 5_000 });
	await expect.poll(() => characterCount(page), { timeout: 8_000 }).toBe(before + 1);
	await expect(page.locator(`${CHAR_AREA} .ca-tab`).first()).toBeVisible({ timeout: 8_000 });
}

/** Ensure at least one character exists and is active. */
export async function ensureCharacter(page: Page): Promise<void> {
	if (await hasActiveCharacter(page)) return;
	await createCharacter(page);
}
