/**
 * expeditions.spec.ts — Expeditions area (v2): journeys, sites, and all
 * interactive features.
 *
 * Coverage:
 *   - Add / delete journeys and sites
 *   - Change theme, domain, feature, danger manually (inline select) and via
 *     the dice-roll button
 *   - Portrait image upload for both journey and site Description tabs
 *   - Denizen table: pick a foe via the foe picker button
 *   - Roll Denizen: opens the denizen dialog, rolls, and can add to Foes
 */
import { test, expect } from '@playwright/test';
import { resetExpeditions, resetFoes } from './helpers/reset';
import { pickBitsUiOption, getBitsUiSelectLabel, bitsUiOptionCount } from './helpers/bits-ui';
import { getFoeCount } from './helpers/foes';

// Site fields (theme / domain / feature / danger) went from native
// `<select>` to the shared bits-ui `<Select>` wrapper. The `id` still
// lands on the trigger button, so `#ea-theme-<siteId>` etc. work as
// locators — but the popover is portalled and the items are
// `.bui-select-item`, so `page.selectOption()` no longer applies.
// The `pickBitsUiOption` helper wraps the click-trigger + click-item
// sequence.

const EXP_AREA = '.home-area--expeditions';
const EXP_HEADER = `${EXP_AREA} .ea-header`;
const EXP_SPINE = `${EXP_AREA} .ea-spine`;

async function waitForExpeditionsLoaded(page: import('@playwright/test').Page) {
	await expect(page.locator(`${EXP_AREA} .ea-loading`)).not.toBeVisible({ timeout: 10_000 });
	await page
		.locator(`${EXP_AREA} .ea-empty, ${EXP_AREA} .ea-body`)
		.first()
		.waitFor({ timeout: 10_000, state: 'attached' });
}

async function switchExpTab(page: import('@playwright/test').Page, label: string) {
	await page.locator(`${EXP_AREA} .ea-tab`, { hasText: new RegExp(`^${label}$`, 'i') }).click();
}

/**
 * Ensure a journey expedition exists and is the active selection.
 * Journeys don't show a theme select in Core; we use that to detect them.
 */
async function ensureJourneySelected(page: import('@playwright/test').Page): Promise<void> {
	const spines = page.locator(EXP_SPINE);
	const count = await spines.count();
	// Search existing spines for a journey (Core tab shows no theme
	// picker; the theme picker id lives on the bits-ui Select trigger
	// `<button id="ea-theme-<siteId>">` when it's a site).
	for (let i = 0; i < count; i++) {
		await spines.nth(i).click();
		await switchExpTab(page, 'Core');
		if (
			!(await page
				.locator(`${EXP_AREA} [id^="ea-theme-"]`)
				.isVisible({ timeout: 500 })
				.catch(() => false))
		) {
			return; // this spine is a journey
		}
	}
	// None found — create one.
	await page.locator(`${EXP_HEADER} button:has-text("+ Journey")`).click();
	await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 5_000 });
	await page.locator('.confirm-modal button:has-text("Start Journey")').click();
	await expect(spines).not.toHaveCount(count, { timeout: 5_000 });
	await spines.last().click();
}

/**
 * Ensure a site expedition exists and is the active selection.
 * Returns the site id (from the `ea-theme-<id>` select's id attribute).
 * Also ensures theme and domain are non-empty (needed for Feature/Danger rolls).
 */
async function ensureSiteSelected(page: import('@playwright/test').Page): Promise<string> {
	const spines = page.locator(EXP_SPINE);

	// Create a site if the list is empty.
	if ((await spines.count()) === 0) {
		await page.locator(`${EXP_HEADER} button:has-text("+ Site")`).click();
		await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 5_000 });
		await pickBitsUiOption(page, '.confirm-modal #ns-theme', { index: 1 });
		await pickBitsUiOption(page, '.confirm-modal #ns-domain', { index: 1 });
		await page.locator('.confirm-modal button:has-text("Create")').click();
		await expect(spines).not.toHaveCount(0, { timeout: 5_000 });
	}

	// Find a site spine (Core tab shows a theme picker — the bits-ui
	// Select trigger carries the `ea-theme-<siteId>` id).
	const themeTrigger = page.locator(`${EXP_AREA} [id^="ea-theme-"]`).first();
	if (!(await themeTrigger.isVisible({ timeout: 1_000 }).catch(() => false))) {
		const count = await spines.count();
		for (let i = 0; i < count; i++) {
			await spines.nth(i).click();
			await switchExpTab(page, 'Core');
			if (await themeTrigger.isVisible({ timeout: 500 }).catch(() => false)) break;
		}
	} else {
		await switchExpTab(page, 'Core');
	}
	await expect(themeTrigger).toBeVisible({ timeout: 3_000 });

	// Ensure theme and domain have non-empty values (needed for feature/danger).
	const themeId = (await themeTrigger.getAttribute('id')) ?? '';
	const siteId = themeId.replace(/^ea-theme-/, '');
	const domainTriggerSelector = `${EXP_AREA} #ea-domain-${siteId}`;
	const themeLabel = await getBitsUiSelectLabel(page, `${EXP_AREA} #${themeId}`);
	if (!themeLabel || themeLabel === '—' || themeLabel === 'Select…') {
		await pickBitsUiOption(page, `${EXP_AREA} #${themeId}`, { index: 0 });
	}
	const domainLabel = await getBitsUiSelectLabel(page, domainTriggerSelector);
	if (!domainLabel || domainLabel === '—' || domainLabel === 'Select…') {
		await pickBitsUiOption(page, domainTriggerSelector, { index: 0 });
	}

	return siteId;
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Expeditions area (v2)', () => {
	// Expeditions tests also add foes to the denizen table, so wipe both.
	test.beforeAll(async () => {
		await resetExpeditions();
		await resetFoes();
	});

	test.beforeEach(async ({ page }) => {
		await page.goto('/home');
		await waitForExpeditionsLoaded(page);
	});

	test('shows + Journey and + Site buttons in header', async ({ page }) => {
		await expect(page.locator(`${EXP_HEADER} button:has-text("+ Journey")`)).toBeVisible();
		await expect(page.locator(`${EXP_HEADER} button:has-text("+ Site")`)).toBeVisible();
	});

	// ── Journeys ──────────────────────────────────────────────────────────────

	test('clicking + Journey opens the new-journey dialog', async ({ page }) => {
		await page.locator(`${EXP_HEADER} button:has-text("+ Journey")`).click();
		await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 5_000 });
		await expect(page.locator('.confirm-modal .cm-title')).toContainText('New Journey');
		await page.keyboard.press('Escape');
	});

	test('can add a journey', async ({ page }) => {
		const before = await page.locator(EXP_SPINE).count();
		await page.locator(`${EXP_HEADER} button:has-text("+ Journey")`).click();
		await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 5_000 });
		await page.locator('.confirm-modal button:has-text("Start Journey")').click();
		await expect(page.locator(EXP_SPINE)).not.toHaveCount(before, { timeout: 5_000 });
	});

	test('can delete a journey', async ({ page }) => {
		const spines = page.locator(EXP_SPINE);
		if ((await spines.count()) === 0) {
			await page.locator(`${EXP_HEADER} button:has-text("+ Journey")`).click();
			await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 5_000 });
			await page.locator('.confirm-modal button:has-text("Start Journey")').click();
			await expect(spines).not.toHaveCount(0, { timeout: 5_000 });
		}
		const countBefore = await spines.count();
		await spines.first().click();
		const deleteBtn = page.locator(`${EXP_AREA} .ea-stage-delete-btn`).first();
		await expect(deleteBtn).toBeVisible({ timeout: 3_000 });
		await deleteBtn.click();
		const confirmBtn = page.locator('.confirm-modal button.btn-danger');
		await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
		await confirmBtn.click();
		await expect(spines).toHaveCount(countBefore - 1, { timeout: 5_000 });
	});

	// ── Sites ─────────────────────────────────────────────────────────────────

	test('clicking + Site opens the new-site dialog', async ({ page }) => {
		await page.locator(`${EXP_HEADER} button:has-text("+ Site")`).click();
		await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 5_000 });
		await expect(page.locator('.confirm-modal .cm-title')).toContainText('New Site');
		await expect(page.locator('.confirm-modal #ns-theme')).toBeVisible();
		await expect(page.locator('.confirm-modal #ns-domain')).toBeVisible();
		await page.keyboard.press('Escape');
	});

	test('can add a site', async ({ page }) => {
		const before = await page.locator(EXP_SPINE).count();
		await page.locator(`${EXP_HEADER} button:has-text("+ Site")`).click();
		await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 5_000 });
		await pickBitsUiOption(page, '.confirm-modal #ns-theme', { index: 1 });
		await pickBitsUiOption(page, '.confirm-modal #ns-domain', { index: 1 });
		await page.locator('.confirm-modal button:has-text("Create")').click();
		await expect(page.locator(EXP_SPINE)).not.toHaveCount(before, { timeout: 5_000 });
	});

	test('can delete a site', async ({ page }) => {
		const spines = page.locator(EXP_SPINE);
		if ((await spines.count()) === 0) {
			await page.locator(`${EXP_HEADER} button:has-text("+ Site")`).click();
			await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 5_000 });
			await pickBitsUiOption(page, '.confirm-modal #ns-theme', { index: 1 });
			await pickBitsUiOption(page, '.confirm-modal #ns-domain', { index: 1 });
			await page.locator('.confirm-modal button:has-text("Create")').click();
			await expect(spines).not.toHaveCount(0, { timeout: 5_000 });
		}
		const countBefore = await spines.count();
		await spines.first().click();
		const deleteBtn = page.locator(`${EXP_AREA} .ea-stage-delete-btn`).first();
		await expect(deleteBtn).toBeVisible({ timeout: 3_000 });
		await deleteBtn.click();
		const confirmBtn = page.locator('.confirm-modal button.btn-danger');
		await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
		await confirmBtn.click();
		await expect(spines).toHaveCount(countBefore - 1, { timeout: 5_000 });
	});

	// ── Theme / Domain (manual + dice) ────────────────────────────────────────

	test('site: can change theme manually via the inline select', async ({ page }) => {
		const siteId = await ensureSiteSelected(page);
		const themeTrigger = `${EXP_AREA} #ea-theme-${siteId}`;
		const optCount = await bitsUiOptionCount(page, themeTrigger);
		// Pick the last option (guaranteed to differ if > 1 option exists).
		await pickBitsUiOption(page, themeTrigger, { index: optCount - 1 });
		const label = await getBitsUiSelectLabel(page, themeTrigger);
		expect(label.length).toBeGreaterThan(0);
	});

	test('site: can change theme via the random dice button', async ({ page }) => {
		const siteId = await ensureSiteSelected(page);
		const themeTrigger = `${EXP_AREA} #ea-theme-${siteId}`;
		const diceBtn = page.locator(`${EXP_AREA} button[aria-label="Random theme"]`);
		await expect(diceBtn).toBeVisible({ timeout: 3_000 });
		await diceBtn.click();
		// Trigger label should be a non-empty theme name after randomisation.
		await expect(async () => {
			const label = await getBitsUiSelectLabel(page, themeTrigger);
			expect(label.length).toBeGreaterThan(0);
		}).toPass({ timeout: 5_000 });
	});

	test('site: can change domain manually via the inline select', async ({ page }) => {
		const siteId = await ensureSiteSelected(page);
		const domainTrigger = `${EXP_AREA} #ea-domain-${siteId}`;
		const optCount = await bitsUiOptionCount(page, domainTrigger);
		await pickBitsUiOption(page, domainTrigger, { index: optCount - 1 });
		const label = await getBitsUiSelectLabel(page, domainTrigger);
		expect(label.length).toBeGreaterThan(0);
	});

	test('site: can change domain via the random dice button', async ({ page }) => {
		const siteId = await ensureSiteSelected(page);
		const domainTrigger = `${EXP_AREA} #ea-domain-${siteId}`;
		const diceBtn = page.locator(`${EXP_AREA} button[aria-label="Random domain"]`);
		await expect(diceBtn).toBeVisible({ timeout: 3_000 });
		await diceBtn.click();
		await expect(async () => {
			const label = await getBitsUiSelectLabel(page, domainTrigger);
			expect(label.length).toBeGreaterThan(0);
		}).toPass({ timeout: 5_000 });
	});

	// ── Feature / Danger (manual + dice) ─────────────────────────────────────

	test('site: can set a feature manually via the inline select', async ({ page }) => {
		const siteId = await ensureSiteSelected(page);
		const featureTrigger = `${EXP_AREA} #ea-feature-${siteId}`;
		await expect(page.locator(featureTrigger)).toBeVisible({ timeout: 3_000 });
		await expect(page.locator(featureTrigger)).not.toBeDisabled();

		// The first option is a "no selection" placeholder; pick index 1 to
		// land on the first real feature. If only the placeholder exists,
		// this theme+domain has no features to pick — skip.
		const optCount = await bitsUiOptionCount(page, featureTrigger);
		if (optCount < 2) {
			test.skip(true, 'No feature options for this theme+domain');
			return;
		}
		await pickBitsUiOption(page, featureTrigger, { index: 1 });
		const label = await getBitsUiSelectLabel(page, featureTrigger);
		expect(label).not.toBe('—');
		expect(label.length).toBeGreaterThan(0);
	});

	test('site: can roll a feature via the dice button', async ({ page }) => {
		const siteId = await ensureSiteSelected(page);
		const featureTrigger = `${EXP_AREA} #ea-feature-${siteId}`;
		const diceBtn = page.locator(`${EXP_AREA} button[aria-label="Random feature"]`);
		await expect(diceBtn).not.toBeDisabled({ timeout: 3_000 });
		await diceBtn.click();
		// Wait for the dice animation + async roll to complete: button re-enables.
		await expect(diceBtn).not.toBeDisabled({ timeout: 10_000 });
		await expect(async () => {
			const label = await getBitsUiSelectLabel(page, featureTrigger);
			expect(label).not.toBe('—');
			expect(label.length).toBeGreaterThan(0);
		}).toPass({ timeout: 5_000 });
	});

	test('site: can set a danger manually via the inline select', async ({ page }) => {
		const siteId = await ensureSiteSelected(page);
		const dangerTrigger = `${EXP_AREA} #ea-danger-${siteId}`;
		await expect(page.locator(dangerTrigger)).toBeVisible({ timeout: 3_000 });
		await expect(page.locator(dangerTrigger)).not.toBeDisabled();

		const optCount = await bitsUiOptionCount(page, dangerTrigger);
		if (optCount < 2) {
			test.skip(true, 'No danger options for this theme+domain');
			return;
		}
		await pickBitsUiOption(page, dangerTrigger, { index: 1 });
		const label = await getBitsUiSelectLabel(page, dangerTrigger);
		expect(label).not.toBe('—');
		expect(label.length).toBeGreaterThan(0);
	});

	test('site: can roll a danger via the dice button', async ({ page }) => {
		const siteId = await ensureSiteSelected(page);
		const dangerTrigger = `${EXP_AREA} #ea-danger-${siteId}`;
		const diceBtn = page.locator(`${EXP_AREA} button[aria-label="Random danger"]`);
		await expect(diceBtn).not.toBeDisabled({ timeout: 3_000 });
		await diceBtn.click();
		await expect(diceBtn).not.toBeDisabled({ timeout: 10_000 });
		await expect(async () => {
			const label = await getBitsUiSelectLabel(page, dangerTrigger);
			expect(label).not.toBe('—');
			expect(label.length).toBeGreaterThan(0);
		}).toPass({ timeout: 5_000 });
	});

	// ── Portrait / image upload ───────────────────────────────────────────────

	// Tiny 1×1 red PNG for testing the FileReader → canvas pipeline.
	const PNG_1X1 = Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI6QAAAABJRU5ErkJggg==',
		'base64',
	);

	test('journey: can add a portrait image via the Description tab', async ({ page }) => {
		await ensureJourneySelected(page);
		await switchExpTab(page, 'Description');

		// The Description tab now uses <PortraitUploader> (.pu-label / .pu-input /
		// .pu-img) — the old inline .ea-portrait-* markup is gone.
		const portraitLabel = page.locator(`${EXP_AREA} .pu-label`);
		await expect(portraitLabel).toBeVisible({ timeout: 3_000 });

		await page
			.locator(`${EXP_AREA} .pu-input`)
			.setInputFiles({ name: 'journey.png', mimeType: 'image/png', buffer: PNG_1X1 });

		// FileReader → Image → canvas pipeline produces a JPEG data URL.
		// PortraitUploader renders the result as img.pu-img (no .pu-img--placeholder).
		const portraitImg = page.locator(`${EXP_AREA} img.pu-img:not(.pu-img--placeholder)`);
		await expect(portraitImg).toBeVisible({ timeout: 5_000 });
		const src = await portraitImg.getAttribute('src');
		expect(src).toMatch(/^data:image\/(jpeg|png);base64,/);
	});

	test('site: can add a portrait image via the Description tab', async ({ page }) => {
		await ensureSiteSelected(page);
		await switchExpTab(page, 'Description');

		const portraitLabel = page.locator(`${EXP_AREA} .pu-label`);
		await expect(portraitLabel).toBeVisible({ timeout: 3_000 });

		await page
			.locator(`${EXP_AREA} .pu-input`)
			.setInputFiles({ name: 'site.png', mimeType: 'image/png', buffer: PNG_1X1 });

		const portraitImg = page.locator(`${EXP_AREA} img.pu-img:not(.pu-img--placeholder)`);
		await expect(portraitImg).toBeVisible({ timeout: 5_000 });
		const src = await portraitImg.getAttribute('src');
		expect(src).toMatch(/^data:image\/(jpeg|png);base64,/);
	});

	// ── Denizen table — foe picker ────────────────────────────────────────────

	test('site: can pick a foe for a denizen slot via the foe picker button', async ({ page }) => {
		await ensureSiteSelected(page);
		await switchExpTab(page, 'Denizens');

		// Click the ⊕ pick button on the first denizen row.
		const pickBtn = page.locator(`${EXP_AREA} .ea-denizen-pick-btn`).first();
		await expect(pickBtn).toBeVisible({ timeout: 3_000 });
		await pickBtn.click();

		// FoePickerDialog opens in denizen mode.
		await expect(page.locator('.foe-dialog')).toBeVisible({ timeout: 5_000 });

		// Click the first foe tile. Scope to [open] because FoePickerDialog is
		// rendered twice on the page (FoesArea + ExpeditionsArea); only the
		// open one is interactable.
		const firstTile = page.locator('.foe-dialog .fd-tile').first();
		await expect(firstTile).toBeVisible({ timeout: 8_000 });
		await firstTile.click();

		// Dialog closes immediately in denizen mode (no confirm step).
		await expect(page.locator('.foe-dialog')).not.toBeVisible({ timeout: 5_000 });

		// The first denizen input should now contain the foe's name.
		const foeName = await page.locator(`${EXP_AREA} .ea-denizen-input`).first().inputValue();
		expect(foeName.trim()).toBeTruthy();
	});

	// ── Denizen table — Roll Denizen + Add to Foes ────────────────────────────

	test('site: Roll Denizen button opens the denizen dialog with the foe table', async ({
		page,
	}) => {
		await ensureSiteSelected(page);
		await switchExpTab(page, 'Denizens');

		const rollBtn = page.locator(`${EXP_AREA} button:has-text("Roll Denizen")`);
		await expect(rollBtn).toBeVisible({ timeout: 3_000 });
		await rollBtn.click();

		await expect(page.locator('.denizen-dialog')).toBeVisible({ timeout: 5_000 });
		// Table view should be visible with the d100 roll button.
		await expect(page.locator('.denizen-dialog .dd-table')).toBeVisible();
		await expect(page.locator('.denizen-dialog button:has-text("Roll d100")')).toBeVisible();

		await page.keyboard.press('Escape');
	});

	test('site: can roll a denizen and add the matched foe to the Foes area', async ({ page }) => {
		await ensureSiteSelected(page);
		await switchExpTab(page, 'Denizens');

		// Fill all 12 denizen slots with a real foe name picked from the catalogue,
		// so any d100 result will match and expose the "Add to Foes" button.
		const pickBtn = page.locator(`${EXP_AREA} .ea-denizen-pick-btn`).first();
		await expect(pickBtn).toBeVisible({ timeout: 3_000 });
		await pickBtn.click();
		await expect(page.locator('.foe-dialog')).toBeVisible({ timeout: 5_000 });
		const firstTile = page.locator('.foe-dialog .fd-tile').first();
		await expect(firstTile).toBeVisible({ timeout: 8_000 });
		await firstTile.click();
		await expect(page.locator('.foe-dialog')).not.toBeVisible({ timeout: 5_000 });

		// Read the foe name that was placed in the first slot.
		const foeName = (
			await page.locator(`${EXP_AREA} .ea-denizen-input`).first().inputValue()
		).trim();
		expect(foeName).toBeTruthy();

		// Fill all remaining 11 slots with the same foe name so any roll hits it.
		const allInputs = page.locator(`${EXP_AREA} .ea-denizen-input`);
		const inputCount = await allInputs.count();
		for (let i = 1; i < inputCount; i++) {
			await allInputs.nth(i).fill(foeName);
		}

		// Record how many foes are currently in the Foes area.
		const foesBefore = await getFoeCount(page);

		// Click Roll Denizen → dialog opens.
		const rollBtn = page.locator(`${EXP_AREA} button:has-text("Roll Denizen")`);
		await rollBtn.click();
		await expect(page.locator('.denizen-dialog')).toBeVisible({ timeout: 5_000 });

		// Click Roll d100 → transitions to result view.
		await page.locator('.denizen-dialog button:has-text("Roll d100")').click();
		// Wait for result view (Add to Foes or Cancel in footer).
		await expect(page.locator('.denizen-dialog .dd-footer')).toBeVisible({ timeout: 10_000 });

		// "Add to Foes" should be present because all slots held a catalogue foe.
		const addBtn = page.locator('.denizen-dialog button:has-text("Add to Foes")');
		await expect(addBtn).toBeVisible({ timeout: 5_000 });
		await addBtn.click();

		// Dialog closes and the Foes area's encounter count ticks up.
		await expect(page.locator('.denizen-dialog')).not.toBeVisible({ timeout: 5_000 });
		await expect.poll(() => getFoeCount(page), { timeout: 5_000 }).toBeGreaterThan(foesBefore);
	});

	// ── Cleanup ───────────────────────────────────────────────────────────────

	test('cleanup: delete all expeditions', async ({ page }) => {
		const spines = page.locator(EXP_SPINE);
		let count = await spines.count();
		while (count > 0) {
			await spines.first().click();
			const deleteBtn = page.locator(`${EXP_AREA} .ea-stage-delete-btn`).first();
			await expect(deleteBtn).toBeVisible({ timeout: 3_000 });
			await deleteBtn.click();
			const confirmBtn = page.locator('.confirm-modal button.btn-danger');
			await expect(confirmBtn).toBeVisible({ timeout: 3_000 });
			await confirmBtn.click();
			count--;
			if (count > 0) {
				await expect(spines).toHaveCount(count, { timeout: 5_000 });
			}
		}
	});
});
