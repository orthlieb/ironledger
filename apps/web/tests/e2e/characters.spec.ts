/**
 * characters.spec.ts — Characters tab: add character, assets, vows.
 */
import { test, expect } from '@playwright/test';

/**
 * Ensure a character exists and is selected.
 * Assumes we're already on the characters tab (called after beforeEach).
 * Creates one if none exist. Returns the active char-card locator.
 */
async function ensureCharacterSelected(page: import('@playwright/test').Page) {
	await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 8000 });
	// Wait for either the char list (with a direct-child card) or empty state to appear
	await page.locator('.char-list--characters > .char-card, .empty-tab').first()
		.waitFor({ timeout: 8000, state: 'attached' });

	// Use direct-child selector to avoid matching nested .char-card inside CharacterSheet
	const cards = page.locator('.char-list--characters > .char-card');
	if (await cards.count() === 0) {
		await page.click('.char-toolbar button.btn-primary');
		await expect(page.locator('.char-card--active')).toBeVisible({ timeout: 5000 });
	} else {
		await cards.first().click();
	}
	const activeCard = page.locator('.char-card--active').first();
	await expect(activeCard).toBeVisible({ timeout: 3000 });
	return activeCard;
}

/** Give the selected character at least `n` XP by clicking the Experience + button. */
async function ensureXp(page: import('@playwright/test').Page, n: number) {
	// XP is shown via ResourceTile label="Experience"; increment button aria-label="Increase Experience"
	// Scope to active character to avoid strict mode issues when multiple chars exist
	const incBtn = page.locator('.char-card--active button[aria-label="Increase Experience"]').first();
	await expect(incBtn).toBeVisible({ timeout: 3000 });
	for (let i = 0; i < n; i++) {
		await incBtn.click();
		await page.waitForTimeout(100);
	}
}

test.describe('Characters tab', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/home');
		// Wait for DB session to finish loading (loading-tab disappears when loadingChars = false)
		await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 8000 });
		await page.click('.tab-btn[data-tab="characters"]');
		await expect(page.locator('.char-toolbar')).toBeVisible({ timeout: 5000 });
	});

	// ── Panel loads ──────────────────────────────────────────────────────────

	test('shows toolbar with New Character button', async ({ page }) => {
		await expect(page.locator('.char-toolbar button.btn-primary')).toContainText('Character');
	});

	test('shows character list or empty state', async ({ page }) => {
		await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 8000 });
		// Wait until chars have loaded (either empty-tab or char-list will be present)
		await page.locator('.char-list--characters > .char-card, .empty-tab').first()
			.waitFor({ timeout: 8000, state: 'attached' });
		const cards = page.locator('.char-list--characters > .char-card');
		const count = await cards.count();
		if (count === 0) {
			await expect(page.locator('.empty-tab')).toBeVisible();
		} else {
			await expect(cards.first()).toBeVisible();
		}
	});

	// ── Add character ────────────────────────────────────────────────────────

	test('clicking New Character adds a character to the list', async ({ page }) => {
		await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 8000 });
		await page.locator('.char-list--characters > .char-card, .empty-tab').first()
			.waitFor({ timeout: 8000, state: 'attached' });
		const before = await page.locator('.char-list--characters > .char-card').count();
		await page.click('.char-toolbar button.btn-primary');
		await expect(page.locator('.char-list--characters > .char-card'))
			.not.toHaveCount(before, { timeout: 8000 });
		await expect(page.locator('.char-card--active')).toBeVisible();
	});

	// ── Character sheet sections ──────────────────────────────────────────────

	test('selected character shows stats and vitals', async ({ page }) => {
		await ensureCharacterSelected(page);
		// Stats section — scoped to the active character
		await expect(page.locator('.char-card--active .stats-row').first()).toBeVisible({ timeout: 3000 });
		// Vitals section — momentum tile is always visible
		await expect(
			page.locator('.char-card--active .momentum-tile, .char-card--active .mt-tile').first()
		).toBeVisible({ timeout: 3000 });
	});

	// ── Assets ───────────────────────────────────────────────────────────────

	test('+ Asset button opens asset picker dialog', async ({ page }) => {
		await ensureCharacterSelected(page);
		await expect(page.locator('.char-card--active .assets-section').first()).toBeVisible({ timeout: 5000 });

		// Give the character at least 3 XP so the + Asset button is enabled
		await ensureXp(page, 3);

		await page.locator('.char-card--active .assets-section button:has-text("+ Asset")').first().click();
		await expect(page.locator('dialog.picker-dialog[open]')).toBeVisible({ timeout: 5000 });
		await page.keyboard.press('Escape');
	});

	test('can add an asset from the picker', async ({ page }) => {
		await ensureCharacterSelected(page);
		await expect(page.locator('.char-card--active .assets-section').first()).toBeVisible({ timeout: 5000 });

		await ensureXp(page, 3);

		const activeCard = page.locator('.char-card--active').first();
		const assetsBefore = await activeCard.locator('.asset-card').count();
		await page.locator('.char-card--active .assets-section button:has-text("+ Asset")').first().click();
		await expect(page.locator('dialog.picker-dialog[open]')).toBeVisible({ timeout: 5000 });
		// Click a tile that is NOT already owned
		const tile = page.locator('dialog.picker-dialog .pick-tile:not(.pick-tile-owned)').first();
		await expect(tile).toBeVisible({ timeout: 5000 });
		await tile.click();
		// A confirmation dialog opens — click "Add to Character" to confirm
		await page.locator('dialog.confirm-dialog button:has-text("Add to Character")').click();
		await expect(page.locator('dialog.picker-dialog[open]')).not.toBeVisible({ timeout: 5000 });
		await expect(activeCard.locator('.asset-card')).not.toHaveCount(assetsBefore, { timeout: 5000 });
	});

	test('can remove an asset via confirmation dialog', async ({ page }) => {
		await ensureCharacterSelected(page);
		const activeCard = page.locator('.char-card--active').first();
		await expect(activeCard.locator('.assets-section')).toBeVisible({ timeout: 5000 });

		await ensureXp(page, 3);

		// Ensure at least one asset exists for this character
		let assetCards = activeCard.locator('.asset-card');
		if (await assetCards.count() === 0) {
			await page.locator('.char-card--active .assets-section button:has-text("+ Asset")').first().click();
			await expect(page.locator('dialog.picker-dialog[open]')).toBeVisible({ timeout: 5000 });
			// Pick first non-owned tile and confirm
			await page.locator('dialog.picker-dialog .pick-tile:not(.pick-tile-owned)').first().click();
			await page.locator('dialog.confirm-dialog button:has-text("Add to Character")').click();
			await expect(page.locator('dialog.picker-dialog[open]')).not.toBeVisible({ timeout: 5000 });
			await expect(assetCards).not.toHaveCount(0, { timeout: 5000 });
		}
		const countBefore = await assetCards.count();

		await assetCards.first().hover();
		await assetCards.first().locator('.btn-remove').click();
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 3000 });
		await page.locator('dialog.confirm-modal[open] button.btn-danger').click();
		await expect(assetCards).toHaveCount(countBefore - 1, { timeout: 5000 });
	});

	// ── Vows ─────────────────────────────────────────────────────────────────

	test('+ Vow button adds a vow card', async ({ page }) => {
		await ensureCharacterSelected(page);
		const activeCard = page.locator('.char-card--active').first();
		const vowsBefore = await activeCard.locator('.vow-card').count();
		await activeCard.locator('button:has-text("+ Vow")').click();
		await expect(activeCard.locator('.vow-card')).toHaveCount(vowsBefore + 1, { timeout: 5000 });
	});

	test('can forsake (delete) a vow via the forsake dialog', async ({ page }) => {
		await ensureCharacterSelected(page);
		const activeCard = page.locator('.char-card--active').first();
		let vowCards = activeCard.locator('.vow-card');
		if (await vowCards.count() === 0) {
			await activeCard.locator('button:has-text("+ Vow")').click();
			await expect(vowCards).toHaveCount(1, { timeout: 5000 });
		}
		const vowsBefore = await vowCards.count();
		await vowCards.first().locator('.btn-forsake').click();
		await expect(page.locator('.confirm-modal[open]')).toBeVisible({ timeout: 3000 });
		await page.locator('dialog.confirm-modal[open] button.btn-danger').click();
		await expect(vowCards).toHaveCount(vowsBefore - 1, { timeout: 5000 });
	});

	// ── Vow notes (markdown) ─────────────────────────────────────────────────
	//
	// Three things are pinned here:
	//   1. A note typed into the textarea is captured and persisted (the textarea
	//      switches into a rendered <p>… block on blur).
	//   2. After a full page reload the note still renders — the backend round-trip
	//      and hydrate path keep `vow.notes` intact.
	//   3. Markdown features (bold, headings, lists) are turned into the matching
	//      HTML by renderNote() — this is what the user sees when they're not in
	//      edit mode.
	//
	// We give the auto-save (1500 ms debounce) at least 2 s before reloading to
	// make sure the PATCH /api/characters/:id has fired and committed.

	test('vow notes: typed text shows rendered HTML on blur', async ({ page }) => {
		await ensureCharacterSelected(page);
		const activeCard = page.locator('.char-card--active').first();

		// Make sure we have a vow to work with.
		const vowCards = activeCard.locator('.vow-card');
		if (await vowCards.count() === 0) {
			await activeCard.locator('button:has-text("+ Vow")').click();
			await expect(vowCards).toHaveCount(1, { timeout: 5000 });
		}
		const vow = vowCards.first();

		// The display block is shown by default — clicking it switches into edit mode.
		const display  = vow.locator('.vow-notes-display');
		const textarea = vow.locator('.vow-notes-textarea');
		await expect(display).toBeVisible();
		await display.click();
		await expect(textarea).toBeVisible({ timeout: 3000 });

		// Type a plain note, blur, expect it to render as a paragraph.
		const noteText = 'Track the smith into the Deep.';
		await textarea.fill(noteText);
		await textarea.blur();

		await expect(display).toBeVisible({ timeout: 3000 });
		await expect(display.locator('p')).toHaveText(noteText);
	});

	test('vow notes: persist across a page reload', async ({ page }) => {
		await ensureCharacterSelected(page);
		const activeCard = page.locator('.char-card--active').first();
		const vowCards   = activeCard.locator('.vow-card');
		if (await vowCards.count() === 0) {
			await activeCard.locator('button:has-text("+ Vow")').click();
			await expect(vowCards).toHaveCount(1, { timeout: 5000 });
		}

		// Use a unique marker so the assertion is unambiguous even if the
		// fixture character already had other vows around.
		const marker   = `note-persist-${Date.now()}`;
		const noteText = `Persisted: ${marker}`;

		const vow      = vowCards.first();
		const display  = vow.locator('.vow-notes-display');
		const textarea = vow.locator('.vow-notes-textarea');

		await display.click();
		await expect(textarea).toBeVisible({ timeout: 3000 });
		await textarea.fill(noteText);
		await textarea.blur();
		await expect(display.locator('p')).toHaveText(noteText, { timeout: 3000 });

		// Wait out the 1500 ms auto-save debounce + the PATCH round-trip.
		await page.waitForTimeout(2200);

		await page.reload();
		await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 8000 });
		await page.click('.tab-btn[data-tab="characters"]');
		await expect(page.locator('.char-toolbar')).toBeVisible({ timeout: 5000 });

		// Re-select the same character; the note should already be on the rendered card.
		const reloadedCard = page.locator('.char-card--active').first();
		if (!(await reloadedCard.isVisible().catch(() => false))) {
			await page.locator('.char-list--characters > .char-card').first().click();
		}
		const restoredVow = page.locator('.char-card--active .vow-card', {
			has: page.locator(`.vow-notes-display p:has-text("${marker}")`),
		}).first();
		await expect(restoredVow).toBeVisible({ timeout: 8000 });
	});

	test('vow notes: markdown renders bold, heading, and list', async ({ page }) => {
		await ensureCharacterSelected(page);
		const activeCard = page.locator('.char-card--active').first();
		const vowCards   = activeCard.locator('.vow-card');
		if (await vowCards.count() === 0) {
			await activeCard.locator('button:has-text("+ Vow")').click();
			await expect(vowCards).toHaveCount(1, { timeout: 5000 });
		}
		const vow      = vowCards.first();
		const display  = vow.locator('.vow-notes-display');
		const textarea = vow.locator('.vow-notes-textarea');

		const markdown =
			'# The Iron Heart\n' +
			'Promised to **Edda** the smith.\n' +
			'- recover the shard\n' +
			'- return alive';

		await display.click();
		await expect(textarea).toBeVisible({ timeout: 3000 });
		await textarea.fill(markdown);
		await textarea.blur();

		await expect(display).toBeVisible({ timeout: 3000 });
		// Heading
		await expect(display.locator('h3')).toHaveText('The Iron Heart');
		// Bold inside paragraph
		await expect(display.locator('p strong')).toHaveText('Edda');
		// Bullet list — two <li>
		await expect(display.locator('ul > li')).toHaveCount(2);
		await expect(display.locator('ul > li').first()).toHaveText('recover the shard');
		await expect(display.locator('ul > li').nth(1)).toHaveText('return alive');
	});

	// ── Cleanup ───────────────────────────────────────────────────────────────

	test('cleanup: delete all characters', async ({ page }) => {
		const cards = page.locator('.char-list--characters > .char-card');
		let count = await cards.count();
		while (count > 0) {
			await cards.first().click();
			await expect(page.locator('.char-card--active button[aria-label="Delete character"]')).toBeVisible({ timeout: 3000 });
			await page.locator('.char-card--active button[aria-label="Delete character"]').click();
			await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 3000 });
			await page.locator('dialog.confirm-modal[open] button.btn-danger').click();
			count--;
			if (count > 0) {
				await expect(cards).toHaveCount(count, { timeout: 5000 });
			} else {
				await expect(page.locator('.empty-tab')).toBeVisible({ timeout: 5000 });
			}
		}
	});
});
