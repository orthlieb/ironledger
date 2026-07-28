/**
 * helpers/bits-ui.ts — thin Playwright helpers for the shared bits-ui
 * `<Select>` wrapper (`.bui-select-*`).
 *
 * The wrapper renders a `<button class="bui-select-trigger">` and
 * portals its `<div class="bui-select-content">` popover next to
 * `document.body` (or into a bound container). Playwright's native
 * `page.selectOption()` doesn't work — it targets HTMLSelectElement.
 * Use these helpers instead:
 *
 *   await pickBitsUiOption(page, '#ns-theme', { index: 1 });
 *   await pickBitsUiOption(page, '#ns-domain', { label: 'Tanglewood' });
 *   const label = await getBitsUiSelectLabel(page, '#ns-theme');
 */
import { expect, type Page } from '@playwright/test';

/** Open a `<Select>` popover and click one of its items. Pass one of:
 *   - `{ index }` — nth item in the popover (0-based).
 *   - `{ label }` — item whose visible text exactly matches.
 *   - `{ value }` — item whose `data-value` attribute matches (bits-ui
 *     mirrors the item's `value` prop onto that attr).
 */
export async function pickBitsUiOption(
	page: Page,
	triggerSelector: string,
	target: { index?: number; label?: string; value?: string },
): Promise<void> {
	await page.locator(triggerSelector).click();
	const content = page.locator('.bui-select-content').last();
	await expect(content).toBeVisible({ timeout: 5_000 });
	let item;
	if (target.index !== undefined) {
		item = content.locator('.bui-select-item').nth(target.index);
	} else if (target.label !== undefined) {
		item = content
			.locator('.bui-select-item')
			.filter({ hasText: new RegExp(`^${escapeRegex(target.label)}$`) })
			.first();
	} else if (target.value !== undefined) {
		item = content.locator(`.bui-select-item[data-value="${target.value}"]`).first();
	} else {
		throw new Error('pickBitsUiOption: pass { index } | { label } | { value }');
	}
	await item.click();
	await expect(content).not.toBeVisible({ timeout: 3_000 });
}

/** Read the current label shown inside the trigger. Useful for assertions
 *  where the old test called `expect(select).toHaveValue(v)`. */
export async function getBitsUiSelectLabel(page: Page, triggerSelector: string): Promise<string> {
	return (await page.locator(`${triggerSelector} .bui-select-value`).textContent())?.trim() ?? '';
}

/** Count popover options — useful when a test needs to pick "the last option". */
export async function bitsUiOptionCount(page: Page, triggerSelector: string): Promise<number> {
	await page.locator(triggerSelector).click();
	const content = page.locator('.bui-select-content').last();
	await expect(content).toBeVisible({ timeout: 5_000 });
	const count = await content.locator('.bui-select-item').count();
	// Close the popover without picking.
	await page.keyboard.press('Escape');
	await expect(content).not.toBeVisible({ timeout: 3_000 });
	return count;
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
