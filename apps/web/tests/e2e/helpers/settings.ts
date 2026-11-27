/**
 * helpers/settings.ts — open the Settings dialog from the ☰ menu.
 */
import { expect, type Locator, type Page } from '@playwright/test';

/** The Settings dialog's tabs. */
export type SettingsTab = 'Appearance' | 'Dice' | 'Expansions' | 'AI' | 'Account';

/**
 * Open ☰ → Settings, and the tab named, if any. Returns the dialog.
 *
 * ☰ is a bits-ui DropdownMenu (`.hamburger-btn` opens `.hm-menu`, whose
 * items are `.hm-item`). A click before the page has hydrated does nothing,
 * so it retries until the menu opens.
 */
export async function openSettings(page: Page, tab?: SettingsTab): Promise<Locator> {
	await expect(async () => {
		await page.locator('.hamburger-btn').click();
		await expect(page.locator('.hm-menu')).toBeVisible({ timeout: 1_000 });
	}).toPass({ timeout: 10_000 });
	await page.locator('.hm-item', { hasText: /settings/i }).click();
	const dialog = page.locator('.settings-dialog');
	await expect(dialog).toBeVisible({ timeout: 3_000 });
	if (tab) {
		await dialog.locator('.sd-tab', { hasText: new RegExp(`^${tab}$`) }).click();
		await expect(dialog.locator('.sd-tab-panel:not([hidden])')).toBeVisible({ timeout: 3_000 });
	}
	return dialog;
}
