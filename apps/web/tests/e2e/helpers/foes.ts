/**
 * helpers/foes.ts — Playwright helpers for the migrated Foes area (v2+).
 *
 * The old spine strip (`.fa-spine` / `.fa-spine--active` / `.fa-stage-name`)
 * was retired: the foe list is now a Popover + Command combobox in the
 * area header, with only one foe visible in the stage at a time. These
 * helpers hide that plumbing so tests read as if the underlying "how do
 * I count / pick / delete a foe?" contract hadn't changed.
 */
import { expect, type Page } from '@playwright/test';

const FOE_AREA = '.home-area--foes';
const FOE_COMBOBOX = `${FOE_AREA} .fa-hdr-combobox`;
const FOE_DELETE = `${FOE_AREA} .fa-hdr-delete-btn`;

/** Total number of foe encounters (active + vanquished). Read from the
 *  `data-foe-count` attribute the FoesArea root exposes for exactly this
 *  purpose — no need to open the popover just to count. */
export async function getFoeCount(page: Page): Promise<number> {
	const attr = await page.locator(FOE_AREA).first().getAttribute('data-foe-count');
	return attr ? Number(attr) : 0;
}

/** Active foe name — the text shown inside the combobox trigger. Returns
 *  an empty string when no foe is selected (empty state). */
export async function getActiveFoeName(page: Page): Promise<string> {
	if ((await page.locator(FOE_COMBOBOX).count()) === 0) return '';
	return (await page.locator(`${FOE_COMBOBOX} .mp-combobox-value`).textContent())?.trim() ?? '';
}

/** Open the foe combobox and pick the item whose text exactly matches
 *  `name`. Useful when a test needs to switch between two encounters. */
export async function pickFoe(page: Page, name: string): Promise<void> {
	await page.locator(FOE_COMBOBOX).click();
	const popover = page.locator('.mp-cmd-popover').last();
	await expect(popover).toBeVisible({ timeout: 3_000 });
	await popover
		.locator('.mp-cmd-item')
		.filter({ hasText: new RegExp(`^${escapeRegex(name)}$`) })
		.first()
		.click();
	await expect(popover).not.toBeVisible({ timeout: 3_000 });
}

/** Click the header trash → confirm dialog's confirm button. Handy for
 *  tests that just need to prune an encounter without asserting on the
 *  confirm-dialog copy. */
export async function deleteActiveFoe(page: Page): Promise<void> {
	await page.locator(FOE_DELETE).first().click();
	const confirm = page.locator('.confirm-modal').last();
	await expect(confirm).toBeVisible({ timeout: 3_000 });
	await confirm.locator('button.btn-danger').click();
	await expect(confirm).not.toBeVisible({ timeout: 3_000 });
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
