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

const EXP_AREA = '.home-area--expeditions';
const EXP_HEADER = `${EXP_AREA} .ea-header`;
// v2 header: combobox switcher (.ea-hdr-combobox) with "+ New Journey…" /
// "+ New Site…"; no spine. Live count on .ea-header-actions[data-exp-count].
// Delete via the gear (.ea-hdr-settings-btn) → ExpeditionOptionsDialog.
const EXP_COMBOBOX = `${EXP_HEADER} .ea-hdr-combobox`;
const EXP_ACTIONS = `${EXP_AREA} .ea-header-actions`;

const FOE_AREA = '.home-area--foes';

async function waitForExpeditionsLoaded(page: import('@playwright/test').Page) {
	await expect(page.locator(`${EXP_AREA} .ea-loading`)).not.toBeVisible({ timeout: 10_000 });
	await page
		.locator(`${EXP_AREA} .ea-empty, ${EXP_AREA} .ea-body`)
		.first()
		.waitFor({ timeout: 10_000, state: 'attached' });
	await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
}

async function switchExpTab(page: import('@playwright/test').Page, label: string) {
	await page.locator(`${EXP_AREA} .ea-tab`, { hasText: new RegExp(`^${label}$`, 'i') }).click();
}

/** Live expedition count from the header. */
async function expCount(page: import('@playwright/test').Page): Promise<number> {
	return Number((await page.locator(EXP_ACTIONS).getAttribute('data-exp-count')) ?? '0');
}

/** Live foe count (data-foe-count on the inner .fa-area). */
async function foeCount(page: import('@playwright/test').Page): Promise<number> {
	return Number((await page.locator(`${FOE_AREA} .fa-area`).getAttribute('data-foe-count')) ?? '0');
}

/** Open a "+ New Journey…" / "+ New Site…" action from the header combobox. */
async function openNewExpedition(page: import('@playwright/test').Page, kind: 'Journey' | 'Site') {
	await page.locator(EXP_COMBOBOX).click();
	await page.locator('.mp-cmd-item--action', { hasText: new RegExp(`New ${kind}`, 'i') }).click();
	await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 5_000 });
}

/** Create a journey via the combobox; it becomes the active expedition.
 *  Name-first dialog: Create is disabled until a name is entered. */
async function createJourney(page: import('@playwright/test').Page) {
	await openNewExpedition(page, 'Journey');
	await page.locator('.confirm-modal .co-input').first().fill('E2E Journey');
	await page.locator('.confirm-modal button:has-text("Create")').click();
	await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 5_000 });
}

/** Pick an option from an app <Select> (bits-ui). `trigger` is a selector for
 *  the trigger element (which carries the `id`); `index` is the 0-based option
 *  in the portalled popup (`.bui-select-content .bui-select-item`). */
async function chooseSelect(
	page: import('@playwright/test').Page,
	trigger: string,
	index = 0,
): Promise<string> {
	await page.locator(trigger).click();
	const items = page.locator('.bui-select-content .bui-select-item');
	await expect(items.first()).toBeVisible({ timeout: 3_000 });
	const n = await items.count();
	const i = index < 0 ? n + index : index;
	const label = (await items.nth(i).innerText()).trim();
	await items.nth(i).click();
	await expect(page.locator('.bui-select-content'))
		.toBeHidden({ timeout: 3_000 })
		.catch(() => {});
	return label;
}

/** Assert an app <Select> trigger holds a real value (not the placeholder). */
async function expectSelectHasValue(page: import('@playwright/test').Page, trigger: string) {
	await expect(page.locator(`${trigger} .bui-select-value--placeholder`)).toHaveCount(0, {
		timeout: 3_000,
	});
}

/** Create a site via the name-first combobox dialog; it becomes active. Theme
 *  and domain start empty — set them inline on the Core tab when needed (see
 *  ensureSiteSelected). */
async function createSite(page: import('@playwright/test').Page) {
	await openNewExpedition(page, 'Site');
	await page.locator('.confirm-modal .co-input').first().fill('E2E Site');
	await page.locator('.confirm-modal button:has-text("Create")').click();
	await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 5_000 });
}

/** Delete the active expedition via the header gear → options → confirm. */
async function deleteActiveExpedition(page: import('@playwright/test').Page) {
	await page.locator(`${EXP_HEADER} .ea-hdr-settings-btn`).click();
	await page.locator('.co-dialog button.btn-danger').click();
	const confirmBtn = page.locator('.confirm-modal button.btn-danger');
	await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
	await confirmBtn.click();
	await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 5_000 });
}

/**
 * Ensure a journey expedition exists and is the active selection.
 * Journeys don't show a theme select in Core; we use that to detect them.
 */
async function ensureJourneySelected(page: import('@playwright/test').Page): Promise<void> {
	// If an expedition is already active and it's a journey (Core tab shows no
	// theme select), reuse it. Otherwise create a journey — it becomes active.
	if (
		await page
			.locator(`${EXP_AREA} .ea-tab`)
			.first()
			.isVisible()
			.catch(() => false)
	) {
		await switchExpTab(page, 'Core');
		const hasTheme = await page
			.locator(`${EXP_AREA} [id^="ea-theme-"]`)
			.first()
			.isVisible({ timeout: 500 })
			.catch(() => false);
		if (!hasTheme) return; // active expedition is a journey
	}
	await createJourney(page);
	await switchExpTab(page, 'Core');
}

/**
 * Ensure a site expedition exists and is the active selection.
 * Returns the site id (from the `ea-theme-<id>` select's id attribute).
 * Also ensures theme and domain are non-empty (needed for Feature/Danger rolls).
 */
async function ensureSiteSelected(page: import('@playwright/test').Page): Promise<string> {
	// Reuse the active expedition if it's already a site (Core tab shows a theme
	// select); otherwise create a site — createSite() sets theme + domain.
	let themeSelect = page.locator(`${EXP_AREA} [id^="ea-theme-"]`).first();
	const activeIsSite =
		(await page
			.locator(`${EXP_AREA} .ea-tab`)
			.first()
			.isVisible()
			.catch(() => false)) &&
		(await (async () => {
			await switchExpTab(page, 'Core');
			return themeSelect.isVisible({ timeout: 500 }).catch(() => false);
		})());
	if (!activeIsSite) {
		await createSite(page);
		await switchExpTab(page, 'Core');
	}
	themeSelect = page.locator(`${EXP_AREA} [id^="ea-theme-"]`).first();
	await expect(themeSelect).toBeVisible({ timeout: 3_000 });

	// Feature/Danger need a theme + domain; new sites start empty, so set them
	// inline (bits-ui Select shows a placeholder value until chosen).
	const id = ((await themeSelect.getAttribute('id')) ?? '').replace(/^ea-theme-/, '');
	if (await page.locator(`${EXP_AREA} [id^="ea-theme-"] .bui-select-value--placeholder`).count()) {
		await chooseSelect(page, `${EXP_AREA} [id^="ea-theme-"]`);
	}
	if (await page.locator(`${EXP_AREA} [id^="ea-domain-"] .bui-select-value--placeholder`).count()) {
		await chooseSelect(page, `${EXP_AREA} [id^="ea-domain-"]`);
	}
	return id;
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

	test('shows the expedition switcher combobox in the header', async ({ page }) => {
		await expect(page.locator(EXP_COMBOBOX)).toBeVisible();
	});

	// ── Journeys ──────────────────────────────────────────────────────────────

	test('the switcher opens the new-journey dialog', async ({ page }) => {
		await openNewExpedition(page, 'Journey');
		await expect(page.locator('.confirm-modal .cm-title')).toContainText('New Journey');
		await page.keyboard.press('Escape');
	});

	test('can add a journey', async ({ page }) => {
		const before = await expCount(page);
		await createJourney(page);
		expect(await expCount(page)).toBe(before + 1);
	});

	test('can delete a journey', async ({ page }) => {
		await createJourney(page);
		const before = await expCount(page);
		await deleteActiveExpedition(page);
		expect(await expCount(page)).toBe(before - 1);
	});

	test('completing an expedition disables its fields (inert); reactivating re-enables', async ({
		page,
	}) => {
		await ensureJourneySelected(page);
		const locked = page.locator(`${EXP_AREA} .ea-locked`);
		const statusSr = `${EXP_AREA} .sr[aria-label="Expedition status"]`;
		const markComplete = page.locator(`${statusSr} .sr-btn[aria-label="Mark complete"]`);
		const markActive = page.locator(`${statusSr} .sr-btn[aria-label="Mark active"]`);

		// Active default: fields are live (not inert).
		expect(await locked.getAttribute('inert')).toBeNull();

		// Complete → the fields below the status row go inert (disabled, not just
		// dimmed) and the tab triggers are disabled; only the status radio + the
		// header gear stay live.
		await markComplete.click();
		await expect(markComplete).toHaveAttribute('aria-checked', 'true');
		await expect(locked).toHaveAttribute('inert', '');
		expect(await page.locator(`${EXP_AREA} .ea-tab[disabled]`).count()).toBeGreaterThan(0);

		// The status radio itself is still clickable → reactivate → fields re-enable.
		await markActive.click();
		await expect(markActive).toHaveAttribute('aria-checked', 'true');
		expect(await locked.getAttribute('inert')).toBeNull();
		expect(await page.locator(`${EXP_AREA} .ea-tab[disabled]`).count()).toBe(0);

		// Let the active state persist (1.5 s auto-save debounce) so this test
		// leaves the expedition Active — a lingering Complete would disable the
		// tab strip and break later tests' switchExpTab().
		await page.waitForTimeout(2_000);
	});

	// ── Sites ─────────────────────────────────────────────────────────────────

	test('the switcher opens the new-site dialog', async ({ page }) => {
		await openNewExpedition(page, 'Site');
		await expect(page.locator('.confirm-modal .cm-title')).toContainText('New Site');
		// Name-first dialog: name field + "Also randomize" Theme/Domain toggles
		// (theme/domain themselves are edited inline once the site exists).
		await expect(page.locator('.confirm-modal .co-input').first()).toBeVisible();
		await expect(page.locator('.confirm-modal .nn-check', { hasText: 'Theme' })).toBeVisible();
		await expect(page.locator('.confirm-modal .nn-check', { hasText: 'Domain' })).toBeVisible();
		await page.keyboard.press('Escape');
	});

	test('can add a site', async ({ page }) => {
		const before = await expCount(page);
		await createSite(page);
		expect(await expCount(page)).toBe(before + 1);
	});

	test('can delete a site', async ({ page }) => {
		await createSite(page);
		const before = await expCount(page);
		await deleteActiveExpedition(page);
		expect(await expCount(page)).toBe(before - 1);
	});

	// ── Theme / Domain (manual + dice) ────────────────────────────────────────

	test('site: can change theme manually via the inline select', async ({ page }) => {
		await ensureSiteSelected(page);
		const theme = `${EXP_AREA} [id^="ea-theme-"]`;
		// Pick the last option and confirm the trigger reflects it.
		const label = await chooseSelect(page, theme, -1);
		await expect(page.locator(`${theme} .bui-select-value`)).toHaveText(label, { timeout: 3_000 });
	});

	test('site: can change theme via the random dice button', async ({ page }) => {
		await ensureSiteSelected(page);
		const theme = `${EXP_AREA} [id^="ea-theme-"]`;
		const diceBtn = page.locator(`${EXP_AREA} button[aria-label="Random theme"]`);
		await expect(diceBtn).toBeVisible({ timeout: 3_000 });
		await diceBtn.click();
		await expectSelectHasValue(page, theme);
	});

	test('site: can change domain manually via the inline select', async ({ page }) => {
		await ensureSiteSelected(page);
		const domain = `${EXP_AREA} [id^="ea-domain-"]`;
		const label = await chooseSelect(page, domain, -1);
		await expect(page.locator(`${domain} .bui-select-value`)).toHaveText(label, { timeout: 3_000 });
	});

	test('site: can change domain via the random dice button', async ({ page }) => {
		await ensureSiteSelected(page);
		const domain = `${EXP_AREA} [id^="ea-domain-"]`;
		const diceBtn = page.locator(`${EXP_AREA} button[aria-label="Random domain"]`);
		await expect(diceBtn).toBeVisible({ timeout: 3_000 });
		await diceBtn.click();
		await expectSelectHasValue(page, domain);
	});

	// ── Feature / Danger (manual + dice) ─────────────────────────────────────

	test('site: can set a feature manually via the inline select', async ({ page }) => {
		await ensureSiteSelected(page);
		const feature = `${EXP_AREA} [id^="ea-feature-"]`;
		await expect(page.locator(feature).first()).toBeVisible({ timeout: 3_000 });
		const label = await chooseSelect(page, feature, 0);
		await expect(page.locator(`${feature} .bui-select-value`)).toHaveText(label, {
			timeout: 3_000,
		});
	});

	test('site: can roll a feature via the dice button', async ({ page }) => {
		await ensureSiteSelected(page);
		const feature = `${EXP_AREA} [id^="ea-feature-"]`;
		const diceBtn = page.locator(`${EXP_AREA} button[aria-label="Random feature"]`);
		await expect(diceBtn).toBeVisible({ timeout: 3_000 });
		await diceBtn.click();
		await expectSelectHasValue(page, feature);
	});

	test('site: can set a danger manually via the inline select', async ({ page }) => {
		await ensureSiteSelected(page);
		const danger = `${EXP_AREA} [id^="ea-danger-"]`;
		await expect(page.locator(danger).first()).toBeVisible({ timeout: 3_000 });
		const label = await chooseSelect(page, danger, 0);
		await expect(page.locator(`${danger} .bui-select-value`)).toHaveText(label, { timeout: 3_000 });
	});

	test('site: can roll a danger via the dice button', async ({ page }) => {
		await ensureSiteSelected(page);
		const danger = `${EXP_AREA} [id^="ea-danger-"]`;
		const diceBtn = page.locator(`${EXP_AREA} button[aria-label="Random danger"]`);
		await expect(diceBtn).toBeVisible({ timeout: 3_000 });
		await diceBtn.click();
		await expectSelectHasValue(page, danger);
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
		const foesBefore = await foeCount(page);

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

		// Dialog closes and a new foe appears in the Foes area.
		await expect(page.locator('.denizen-dialog')).not.toBeVisible({ timeout: 5_000 });
		await expect.poll(() => foeCount(page), { timeout: 5_000 }).toBeGreaterThan(foesBefore);
	});

	// ── Cleanup ───────────────────────────────────────────────────────────────

	test('cleanup: delete all expeditions', async ({ page }) => {
		for (let guard = 0; guard < 30; guard++) {
			if ((await expCount(page)) === 0) break;
			await deleteActiveExpedition(page);
		}
		expect(await expCount(page)).toBe(0);
	});
});
