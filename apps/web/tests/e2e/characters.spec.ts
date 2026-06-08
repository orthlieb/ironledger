/**
 * characters.spec.ts — Characters area (v2): add character, assets, vows.
 *
 * v2 layout has no tabs. The Characters area is always visible in the
 * top-left of the deck-of-cards layout. Stats / Vitals / Vows / Assets /
 * Status are sub-tabs INSIDE the area's stage (.ca-tab buttons).
 */
import { test, expect } from '@playwright/test';
import { resetCharacters } from './helpers/reset';

const CHAR_AREA = '.home-area--characters';
const CHAR_HEADER = `${CHAR_AREA} .ca-header`;
const CHAR_SPINE = `${CHAR_AREA} .ca-spine`;
const CHAR_STAGE = `${CHAR_AREA} .ca-stage`;

/**
 * Wait for the Characters area to finish its initial load.
 * The area renders one of: .ca-loading, .ca-empty, or .ca-body — wait for
 * loading to disappear and one of the other two to appear.
 */
async function waitForCharactersLoaded(page: import('@playwright/test').Page) {
	await expect(page.locator(`${CHAR_AREA} .ca-loading`)).not.toBeVisible({ timeout: 10_000 });
	await page
		.locator(`${CHAR_AREA} .ca-empty, ${CHAR_AREA} .ca-body`)
		.first()
		.waitFor({ timeout: 10_000, state: 'attached' });
}

/**
 * Switch to a specific Characters sub-tab (Core / Description / Vows / Assets / Status).
 */
async function switchCharTab(page: import('@playwright/test').Page, label: string) {
	await page.locator(`${CHAR_AREA} .ca-tab`, { hasText: new RegExp(`^${label}$`, 'i') }).click();
}

/**
 * Ensure a character exists. Creates one if none exist; the v2 area
 * auto-selects the first character on load. Returns the stage locator.
 */
async function ensureCharacterSelected(page: import('@playwright/test').Page) {
	await waitForCharactersLoaded(page);
	const spines = page.locator(CHAR_SPINE);
	if ((await spines.count()) === 0) {
		await page.locator(`${CHAR_HEADER} button:has-text("+ Character")`).click();
		await expect(page.locator(CHAR_SPINE)).not.toHaveCount(0, { timeout: 8_000 });
	}
	// Wait for the active character's tabs to render — proves activeChar AND
	// activeData are both populated (the {#if activeChar && activeData} branch
	// has fired). An empty .ca-stage div renders even before activeData is
	// hydrated, so checking visibility of .ca-stage alone is insufficient.
	await expect(page.locator(`${CHAR_AREA} .ca-tab`).first()).toBeVisible({ timeout: 8_000 });
	return page.locator(CHAR_STAGE);
}

test.describe('Characters area (v2)', () => {
	test.beforeAll(async () => {
		await resetCharacters();
	});

	test.beforeEach(async ({ page }) => {
		await page.goto('/home');
		await waitForCharactersLoaded(page);
	});

	// ── Area loads ────────────────────────────────────────────────────────────

	test('shows header with + Character button', async ({ page }) => {
		await expect(page.locator(`${CHAR_HEADER} button:has-text("+ Character")`)).toBeVisible();
	});

	test('shows spine list or empty state', async ({ page }) => {
		const spines = page.locator(CHAR_SPINE);
		const count = await spines.count();
		if (count === 0) {
			await expect(page.locator(`${CHAR_AREA} .ca-empty`)).toBeVisible();
		} else {
			await expect(spines.first()).toBeVisible();
		}
	});

	// ── Add character ─────────────────────────────────────────────────────────

	test('clicking + Character adds a character to the spine list', async ({ page }) => {
		const before = await page.locator(CHAR_SPINE).count();
		await page.locator(`${CHAR_HEADER} button:has-text("+ Character")`).click();
		await expect(page.locator(CHAR_SPINE)).not.toHaveCount(before, { timeout: 8_000 });
		await expect(page.locator(CHAR_STAGE)).toBeVisible({ timeout: 5_000 });
	});

	// ── Character stage sections ──────────────────────────────────────────────

	test('selected character shows stats and vitals on the Core tab', async ({ page }) => {
		await ensureCharacterSelected(page);
		await switchCharTab(page, 'Core');
		// Stats row (5 stat tiles).
		await expect(page.locator(`${CHAR_AREA} .ca-stats-row .stat-tile`).first()).toBeVisible({
			timeout: 3_000,
		});
		// Vitals — MomentumTile and ResourceTile.
		await expect(
			page
				.locator(`${CHAR_AREA} .ca-vitals-row .mt-tile, ${CHAR_AREA} .ca-vitals-row .res-tile`)
				.first(),
		).toBeVisible({ timeout: 3_000 });
	});

	// ── Assets ────────────────────────────────────────────────────────────────

	test('+ Asset button opens asset picker dialog', async ({ page }) => {
		await ensureCharacterSelected(page);
		await page.locator(`${CHAR_HEADER} button:has-text("+ Asset")`).click();
		await expect(page.locator('dialog.picker-dialog[open]')).toBeVisible({ timeout: 5_000 });
		await page.keyboard.press('Escape');
	});

	test('can add an asset from the picker', async ({ page }) => {
		await ensureCharacterSelected(page);

		// Switch to the Assets sub-tab so we can count cards visibly.
		await switchCharTab(page, 'Assets');
		const assetCards = page.locator(`${CHAR_AREA} .ca-asset-card`);
		const assetsBefore = await assetCards.count();

		await page.locator(`${CHAR_HEADER} button:has-text("+ Asset")`).click();
		await expect(page.locator('dialog.picker-dialog[open]')).toBeVisible({ timeout: 5_000 });
		// Pick a tile that isn't already owned.
		const tile = page.locator('dialog.picker-dialog .pick-tile:not(.pick-tile-owned)').first();
		await expect(tile).toBeVisible({ timeout: 5_000 });
		await tile.click();
		// Editable AssetCard opens in add mode — click "Add" in its footer.
		await expect(page.locator('dialog.ca-asset-dialog[open]')).toBeVisible({ timeout: 5_000 });
		await page.locator('dialog.ca-asset-dialog[open] .asset-footer .btn-primary').click();
		await expect(page.locator('dialog.ca-asset-dialog[open]')).not.toBeVisible({ timeout: 5_000 });
		await expect(page.locator('dialog.picker-dialog[open]')).not.toBeVisible({ timeout: 5_000 });
		await expect(assetCards).not.toHaveCount(assetsBefore, { timeout: 5_000 });
	});

	test('can remove an asset via the asset dialog', async ({ page }) => {
		await ensureCharacterSelected(page);
		await switchCharTab(page, 'Assets');

		// Ensure at least one asset exists.
		const assetCards = page.locator(`${CHAR_AREA} .ca-asset-card`);
		if ((await assetCards.count()) === 0) {
			await page.locator(`${CHAR_HEADER} button:has-text("+ Asset")`).click();
			await expect(page.locator('dialog.picker-dialog[open]')).toBeVisible({ timeout: 5_000 });
			await page.locator('dialog.picker-dialog .pick-tile:not(.pick-tile-owned)').first().click();
			// AssetCard opens in add mode — click Add to commit.
			await expect(page.locator('dialog.ca-asset-dialog[open]')).toBeVisible({ timeout: 5_000 });
			await page.locator('dialog.ca-asset-dialog[open] .asset-footer .btn-primary').click();
			await expect(page.locator('dialog.picker-dialog[open]')).not.toBeVisible({ timeout: 5_000 });
			await expect(assetCards).not.toHaveCount(0, { timeout: 5_000 });
		}
		const countBefore = await assetCards.count();

		// Click the asset chit's main button → opens the asset dialog → click Delete.
		await assetCards.first().locator('.ca-asset-card-main').click();
		await expect(page.locator('dialog.ca-asset-dialog[open]')).toBeVisible({ timeout: 3_000 });
		await page.locator('dialog.ca-asset-dialog[open] .asset-footer .btn-danger').click();
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 3_000 });
		await page.locator('dialog.confirm-modal[open] button.btn-danger').click();
		await expect(assetCards).toHaveCount(countBefore - 1, { timeout: 5_000 });
	});

	// ── Vows ──────────────────────────────────────────────────────────────────

	test('+ Vow button adds a vow card', async ({ page }) => {
		await ensureCharacterSelected(page);
		await switchCharTab(page, 'Vows');
		const vowCards = page.locator(`${CHAR_AREA} .vow-card`);
		const vowsBefore = await vowCards.count();
		await page.locator(`${CHAR_HEADER} button:has-text("+ Vow")`).click();
		await expect(vowCards).toHaveCount(vowsBefore + 1, { timeout: 5_000 });
	});

	test('can forsake (delete) a vow via the forsake dialog', async ({ page }) => {
		await ensureCharacterSelected(page);
		await switchCharTab(page, 'Vows');
		const vowCards = page.locator(`${CHAR_AREA} .vow-card`);
		if ((await vowCards.count()) === 0) {
			await page.locator(`${CHAR_HEADER} button:has-text("+ Vow")`).click();
			await expect(vowCards).toHaveCount(1, { timeout: 5_000 });
		}
		const vowsBefore = await vowCards.count();
		await vowCards.first().locator('.btn-trash').click();
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 3_000 });
		await page.locator('dialog.confirm-modal[open] button.btn-danger').click();
		await expect(vowCards).toHaveCount(vowsBefore - 1, { timeout: 5_000 });
	});

	// ── Vow notes (markdown) ──────────────────────────────────────────────────

	test('vow notes: typed text shows rendered HTML on blur', async ({ page }) => {
		await ensureCharacterSelected(page);
		await switchCharTab(page, 'Vows');

		const vowCards = page.locator(`${CHAR_AREA} .vow-card`);
		if ((await vowCards.count()) === 0) {
			await page.locator(`${CHAR_HEADER} button:has-text("+ Vow")`).click();
			await expect(vowCards).toHaveCount(1, { timeout: 5_000 });
		}
		const vow = vowCards.first();

		const display = vow.locator('.md-notes-display');
		const textarea = vow.locator('.md-notes-input');
		await expect(display).toBeVisible();
		await display.click();
		await expect(textarea).toBeVisible({ timeout: 3_000 });

		const noteText = 'Track the smith into the Deep.';
		await textarea.fill(noteText);
		await textarea.blur();

		await expect(display).toBeVisible({ timeout: 3_000 });
		await expect(display.locator('p')).toHaveText(noteText);
	});

	test('vow notes: persist across a page reload', async ({ page }) => {
		await ensureCharacterSelected(page);
		await switchCharTab(page, 'Vows');

		const vowCards = page.locator(`${CHAR_AREA} .vow-card`);
		if ((await vowCards.count()) === 0) {
			await page.locator(`${CHAR_HEADER} button:has-text("+ Vow")`).click();
			await expect(vowCards).toHaveCount(1, { timeout: 5_000 });
		}

		const marker = `note-persist-${Date.now()}`;
		const noteText = `Persisted: ${marker}`;

		const vow = vowCards.first();
		const display = vow.locator('.md-notes-display');
		const textarea = vow.locator('.md-notes-input');

		await display.click();
		await expect(textarea).toBeVisible({ timeout: 3_000 });
		await textarea.fill(noteText);
		await textarea.blur();
		await expect(display.locator('p')).toHaveText(noteText, { timeout: 3_000 });

		// Wait out the 1500 ms auto-save debounce + the PATCH round-trip.
		await page.waitForTimeout(2_200);

		await page.reload();
		await waitForCharactersLoaded(page);
		await switchCharTab(page, 'Vows');

		const restoredVow = page
			.locator(`${CHAR_AREA} .vow-card`, {
				has: page.locator(`.md-notes-display p:has-text("${marker}")`),
			})
			.first();
		await expect(restoredVow).toBeVisible({ timeout: 8_000 });
	});

	test('vow notes: markdown renders bold, heading, and list', async ({ page }) => {
		await ensureCharacterSelected(page);
		await switchCharTab(page, 'Vows');

		const vowCards = page.locator(`${CHAR_AREA} .vow-card`);
		if ((await vowCards.count()) === 0) {
			await page.locator(`${CHAR_HEADER} button:has-text("+ Vow")`).click();
			await expect(vowCards).toHaveCount(1, { timeout: 5_000 });
		}
		const vow = vowCards.first();
		const display = vow.locator('.md-notes-display');
		const textarea = vow.locator('.md-notes-input');

		const markdown =
			'# The Iron Heart\n' +
			'Promised to **Edda** the smith.\n' +
			'- recover the shard\n' +
			'- return alive';

		await display.click();
		await expect(textarea).toBeVisible({ timeout: 3_000 });
		await textarea.fill(markdown);
		await textarea.blur();

		await expect(display).toBeVisible({ timeout: 3_000 });
		await expect(display.locator('h3')).toHaveText('The Iron Heart');
		await expect(display.locator('p strong')).toHaveText('Edda');
		await expect(display.locator('ul > li')).toHaveCount(2);
		await expect(display.locator('ul > li').first()).toHaveText('recover the shard');
		await expect(display.locator('ul > li').nth(1)).toHaveText('return alive');
	});

	// ── Portrait ──────────────────────────────────────────────────────────────

	test('clicking the portrait in the Description tab opens a file picker and displays the selected image', async ({
		page,
	}) => {
		await ensureCharacterSelected(page);
		await switchCharTab(page, 'Description');

		const portraitLabel = page.locator(`${CHAR_AREA} .pu-label`);
		await expect(portraitLabel).toBeVisible({ timeout: 3_000 });

		// Supply a tiny synthetic PNG so the FileReader → Image → canvas pipeline runs.
		// Using setInputFiles bypasses the system file-picker dialog.
		const pngBuffer = Buffer.from(
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI6QAAAABJRU5ErkJggg==',
			'base64',
		);
		const input = page.locator(`${CHAR_AREA} .pu-input`);
		await input.setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: pngBuffer });

		// After the FileReader → Image → canvas pipeline the portrait <img> should appear
		// (replaces the .pu-img--placeholder div).
		await expect(page.locator(`${CHAR_AREA} img.pu-img`)).toBeVisible({ timeout: 5_000 });

		// The src must be a JPEG data URL produced by canvas.toDataURL('image/jpeg', 0.85).
		const src = await page.locator(`${CHAR_AREA} img.pu-img`).getAttribute('src');
		expect(src).toMatch(/^data:image\/jpeg;base64,/);
	});

	// ── Cleanup ───────────────────────────────────────────────────────────────

	test('cleanup: delete all characters', async ({ page }) => {
		const spines = page.locator(CHAR_SPINE);
		let count = await spines.count();
		while (count > 0) {
			await spines.first().click();
			const deleteBtn = page.locator(`${CHAR_AREA} .ca-stage-delete-btn`).first();
			await expect(deleteBtn).toBeVisible({ timeout: 3_000 });
			await deleteBtn.click();
			await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 3_000 });
			await page.locator('dialog.confirm-modal[open] button.btn-danger').click();
			count--;
			if (count > 0) {
				await expect(spines).toHaveCount(count, { timeout: 5_000 });
			} else {
				await expect(page.locator(`${CHAR_AREA} .ca-empty`)).toBeVisible({ timeout: 5_000 });
			}
		}
	});
});
