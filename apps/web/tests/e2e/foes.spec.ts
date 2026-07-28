/**
 * foes.spec.ts — Foes area (v2): add, switch, delete a foe.
 *
 * v2 layout: the Foes area lives in the bottom-left of the deck-of-cards
 * layout and is always visible. The vertical spine strip was retired —
 * the foe list is now a Popover + Command combobox in the area header,
 * with only one foe visible in the stage at a time. Helpers in
 * `./helpers/foes.ts` hide that plumbing.
 */
import { test, expect } from '@playwright/test';
import { resetFoes } from './helpers/reset';
import { getFoeCount, getActiveFoeName, pickFoe, deleteActiveFoe } from './helpers/foes';

const FOE_AREA = '.home-area--foes';
const FOE_HEADER = `${FOE_AREA} .fa-header`;
const FOE_COMBOBOX = `${FOE_AREA} .fa-hdr-combobox`;

async function waitForFoesLoaded(page: import('@playwright/test').Page) {
	await expect(page.locator(`${FOE_AREA} .fa-loading`)).not.toBeVisible({ timeout: 10_000 });
	await page
		.locator(`${FOE_AREA} .fa-empty, ${FOE_AREA} .fa-body`)
		.first()
		.waitFor({ timeout: 10_000, state: 'attached' });
}

/**
 * Add a foe via the two-step picker flow — mirrors the pre-migration helper
 * so tests still read as "add a foe" without caring which entry point
 * (empty-state "+ Foe" button or combobox "+ New foe" action) launched it.
 */
async function addFoeFromPicker(page: import('@playwright/test').Page) {
	const foeTile = page.locator('.foe-dialog .fd-tile').first();
	await expect(foeTile).toBeVisible({ timeout: 8_000 });
	await foeTile.click();
	const addBtn = page.locator('.foe-dialog button:has-text("Add to Foes")');
	await expect(addBtn).toBeVisible({ timeout: 3_000 });
	await addBtn.click();
	await expect(page.locator('.foe-dialog')).not.toBeVisible({ timeout: 5_000 });
}

/** Open the picker regardless of empty vs populated state — clicks the
 *  header "+ Foe" button on empty state, or the combobox "+ New foe…"
 *  action item otherwise. */
async function openFoePicker(page: import('@playwright/test').Page) {
	if ((await getFoeCount(page)) === 0) {
		await page.locator(`${FOE_HEADER} button:has-text("+ Foe")`).click();
	} else {
		await page.locator(FOE_COMBOBOX).click();
		const popover = page.locator('.mp-cmd-popover').last();
		await expect(popover).toBeVisible({ timeout: 3_000 });
		await popover
			.locator('.mp-cmd-item--action', { hasText: /New foe/i })
			.first()
			.click();
	}
	await expect(page.locator('.foe-dialog')).toBeVisible({ timeout: 5_000 });
}

test.describe('Foes area (v2)', () => {
	test.beforeAll(async () => {
		await resetFoes();
	});

	test.beforeEach(async ({ page }) => {
		await page.goto('/home');
		await waitForFoesLoaded(page);
	});

	test('empty state shows + Foe button in the header', async ({ page }) => {
		// Prerequisite: no foes exist yet (beforeAll resets).
		if ((await getFoeCount(page)) === 0) {
			await expect(page.locator(`${FOE_HEADER} button:has-text("+ Foe")`)).toBeVisible();
		}
	});

	test('clicking + Foe opens foe picker dialog', async ({ page }) => {
		await openFoePicker(page);
		await page.keyboard.press('Escape');
	});

	test('can add a foe from the picker', async ({ page }) => {
		const before = await getFoeCount(page);
		await openFoePicker(page);
		await addFoeFromPicker(page);
		await expect.poll(() => getFoeCount(page), { timeout: 5_000 }).toBeGreaterThan(before);
	});

	test('adding a foe makes it the active one', async ({ page }) => {
		if ((await getFoeCount(page)) === 0) {
			await openFoePicker(page);
			await addFoeFromPicker(page);
			await expect.poll(() => getFoeCount(page), { timeout: 5_000 }).toBeGreaterThan(0);
		}
		// Active foe's name appears in the combobox trigger.
		await expect(page.locator(`${FOE_COMBOBOX} .mp-combobox-value`)).toBeVisible({
			timeout: 3_000,
		});
		expect((await getActiveFoeName(page)).length).toBeGreaterThan(0);
	});

	test('selected foe shows stage with foe details', async ({ page }) => {
		if ((await getFoeCount(page)) === 0) {
			await openFoePicker(page);
			await addFoeFromPicker(page);
			await expect.poll(() => getFoeCount(page), { timeout: 5_000 }).toBeGreaterThan(0);
		}
		// The stage is the card body — visible whenever an active foe exists.
		await expect(page.locator(`${FOE_AREA} .fa-card`)).toBeVisible({ timeout: 3_000 });
	});

	test('can switch between two foes via the combobox', async ({ page }) => {
		// Ensure at least two encounters exist so switching is meaningful.
		while ((await getFoeCount(page)) < 2) {
			await openFoePicker(page);
			await addFoeFromPicker(page);
			await expect.poll(() => getFoeCount(page), { timeout: 5_000 }).toBeGreaterThan(0);
		}

		// Enumerate the popover items to know both names.
		await page.locator(FOE_COMBOBOX).click();
		const popover = page.locator('.mp-cmd-popover').last();
		await expect(popover).toBeVisible({ timeout: 3_000 });
		const names = await popover.locator('.mp-cmd-item:not(.mp-cmd-item--action)').allTextContents();
		await page.keyboard.press('Escape');
		await expect(popover).not.toBeVisible({ timeout: 3_000 });
		const [nameA, nameB] = names.map((n) => n.trim());
		expect(nameA).toBeTruthy();
		expect(nameB).toBeTruthy();
		expect(nameA).not.toBe(nameB);

		await pickFoe(page, nameB);
		expect(await getActiveFoeName(page)).toBe(nameB);
		await pickFoe(page, nameA);
		expect(await getActiveFoeName(page)).toBe(nameA);
	});

	test('can delete a foe', async ({ page }) => {
		if ((await getFoeCount(page)) === 0) {
			await openFoePicker(page);
			await addFoeFromPicker(page);
			await expect.poll(() => getFoeCount(page), { timeout: 5_000 }).toBeGreaterThan(0);
		}
		const before = await getFoeCount(page);
		await deleteActiveFoe(page);
		await expect.poll(() => getFoeCount(page), { timeout: 5_000 }).toBe(before - 1);
	});

	// ── Cleanup ───────────────────────────────────────────────────────────────

	test('cleanup: delete all foes', async ({ page }) => {
		while ((await getFoeCount(page)) > 0) {
			await deleteActiveFoe(page);
		}
	});
});
