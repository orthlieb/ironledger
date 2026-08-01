/**
 * foes.spec.ts — Foes area (v2): add and delete a foe.
 *
 * v2 header: a combobox switcher (`.fa-hdr-combobox`) with "+ New foe…" opens
 * the FoePickerDialog (`.foe-dialog`); the picked foe becomes the active
 * encounter. Live count is on `.fa-area` (`data-foe-count`); deleting the
 * active foe is the trash button (`.fa-hdr-settings-btn`) → confirm.
 */
import { test, expect, type Page } from '@playwright/test';
import { resetFoes } from './helpers/reset';

const FOE_AREA = '.home-area--foes';
const FOE_HEADER = `${FOE_AREA} .fa-header`;
const FOE_COMBOBOX = `${FOE_HEADER} .fa-hdr-combobox`;

async function waitForFoesLoaded(page: Page) {
	await expect(page.locator(`${FOE_AREA} .fa-loading`)).not.toBeVisible({ timeout: 10_000 });
	await page
		.locator(`${FOE_AREA} .fa-empty, ${FOE_AREA} .fa-body`)
		.first()
		.waitFor({ timeout: 10_000, state: 'attached' });
	await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
}

async function foeCount(page: Page): Promise<number> {
	// data-foe-count lives on the inner .fa-area root, not the .home-area--foes wrapper.
	return Number((await page.locator(`${FOE_AREA} .fa-area`).getAttribute('data-foe-count')) ?? '0');
}

/** Open the foe picker via the combobox "+ New foe…" action. */
async function openFoePicker(page: Page) {
	await page.locator(FOE_COMBOBOX).click();
	await page.locator('.mp-cmd-item--action', { hasText: /New foe/i }).click();
	await expect(page.locator('.foe-dialog')).toBeVisible({ timeout: 5_000 });
}

/** Add a foe: open picker, pick the first tile, confirm "Add to Foes". */
async function addFoe(page: Page) {
	await openFoePicker(page);
	const foeTile = page.locator('.foe-dialog .fd-tile').first();
	await expect(foeTile).toBeVisible({ timeout: 8_000 });
	await foeTile.click();
	const addBtn = page.locator('.foe-dialog button:has-text("Add to Foes")');
	await expect(addBtn).toBeVisible({ timeout: 3_000 });
	await addBtn.click();
	await expect(page.locator('.foe-dialog')).not.toBeVisible({ timeout: 5_000 });
}

async function deleteActiveFoe(page: Page) {
	// Delete lives behind the header gear → FoeOptionsDialog → confirm.
	await page.locator(`${FOE_HEADER} .fa-hdr-settings-btn`).click();
	await page.locator('.co-dialog button.btn-danger').click();
	const confirmBtn = page.locator('.confirm-modal button.btn-danger');
	await expect(confirmBtn).toBeVisible({ timeout: 3_000 });
	await confirmBtn.click();
	await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 5_000 });
}

test.describe('Foes area (v2)', () => {
	test.beforeAll(async () => {
		await resetFoes();
	});

	test.beforeEach(async ({ page }) => {
		await page.goto('/home');
		await waitForFoesLoaded(page);
	});

	test('shows header with the foe switcher combobox', async ({ page }) => {
		await expect(page.locator(FOE_COMBOBOX)).toBeVisible();
	});

	test('the switcher opens the foe picker dialog', async ({ page }) => {
		await openFoePicker(page);
		await page.keyboard.press('Escape');
	});

	test('can add a foe from the picker', async ({ page }) => {
		const before = await foeCount(page);
		await addFoe(page);
		expect(await foeCount(page)).toBe(before + 1);
	});

	test('a newly-added foe becomes active and shows its stage', async ({ page }) => {
		if ((await foeCount(page)) === 0) await addFoe(page);
		// Active foe → its stage tabs and the delete control render.
		await expect(page.locator(`${FOE_AREA} .fa-tab`).first()).toBeVisible({ timeout: 3_000 });
		await expect(page.locator(`${FOE_HEADER} .fa-hdr-settings-btn`)).toBeVisible({
			timeout: 3_000,
		});
	});

	test('can delete a foe', async ({ page }) => {
		if ((await foeCount(page)) === 0) await addFoe(page);
		const before = await foeCount(page);
		await deleteActiveFoe(page);
		expect(await foeCount(page)).toBe(before - 1);
	});

	// ── Cleanup ───────────────────────────────────────────────────────────────

	test('cleanup: delete all foes', async ({ page }) => {
		for (let guard = 0; guard < 30; guard++) {
			if ((await foeCount(page)) === 0) break;
			await deleteActiveFoe(page);
		}
		expect(await foeCount(page)).toBe(0);
		await expect(page.locator(`${FOE_AREA} .fa-empty`)).toBeVisible({ timeout: 5_000 });
	});
});
