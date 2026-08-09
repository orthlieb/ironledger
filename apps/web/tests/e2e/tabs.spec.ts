/**
 * tabs.spec.ts — Tab-accessibility coverage for v2 card areas.
 *
 * For each "card" area with tabs (Characters / Communities / Expeditions /
 * Foes), this spec:
 *   1. Ensures at least one entry exists in the area.
 *   2. Clicks every tab in turn.
 *   3. Asserts that the tab becomes active (gains the `*-tab--active` class).
 *   4. Asserts that a unique marker for that tab's panel content is visible.
 */
import { test, expect, type Page } from '@playwright/test';
import { resetAll } from './helpers/reset';
import { settleHome, ensureCharacter } from './helpers/home';

// ── Area constants ───────────────────────────────────────────────────────────

const CHAR_AREA = '.home-area--characters';

const CM_AREA = '.home-area--communities';

const EXP_AREA = '.home-area--expeditions';

const FOE_AREA = '.home-area--foes';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function waitForHome(page: Page): Promise<void> {
	await expect(page.locator(`${CHAR_AREA} .ca-loading`)).not.toBeVisible({ timeout: 12_000 });
	await page
		.locator(`${CHAR_AREA} .ca-empty, ${CHAR_AREA} .ca-body`)
		.first()
		.waitFor({ timeout: 12_000, state: 'attached' });
}

/**
 * Click a tab, assert it becomes active, and assert a panel-content marker
 * appears. The tabSelector picks the specific button; the activeRegex matches
 * the active-state class (e.g. `ca-tab--active`); the markerSelector identifies
 * a unique element rendered for that tab's panel.
 */
async function expectTabActivates(
	page: Page,
	tabSelector: string,
	_activeClass: string,
	markerSelector: string,
): Promise<void> {
	// Tabs are bits-ui Tabs.Trigger — the active one carries data-state="active"
	// (aria-selected="true"), not an `*-tab--active` CSS class.
	const tab = page.locator(tabSelector).first();
	await tab.click();
	await expect(tab).toHaveAttribute('data-state', 'active');
	await expect(page.locator(markerSelector).first()).toBeVisible({ timeout: 3_000 });
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Tab accessibility — v2 areas', () => {
	test.beforeAll(async () => {
		await resetAll();
	});

	test.beforeEach(async ({ page }) => {
		await page.goto('/home');
		await waitForHome(page);
	});

	// ── Characters area ──────────────────────────────────────────────────────

	test('CharactersArea — every tab activates and renders its panel', async ({ page }) => {
		await settleHome(page);
		await ensureCharacter(page);
		// Wait for tabs to render.
		await expect(page.locator(`${CHAR_AREA} .ca-tab`).first()).toBeVisible({ timeout: 8_000 });

		// Core: stats row (5 stat tiles) and vitals row.
		await expectTabActivates(
			page,
			`${CHAR_AREA} .ca-tab:has-text("Core")`,
			'ca-tab--active',
			`${CHAR_AREA} .ca-stats-row`,
		);

		// Background: background section with portrait uploader.
		await expectTabActivates(
			page,
			`${CHAR_AREA} .ca-tab:has-text("Background")`,
			'ca-tab--active',
			`${CHAR_AREA} .ca-bg-section`,
		);

		// Vows: either the vow-list (when vows exist) or the "No vows yet"
		// empty hint must show — both are unique to this tab.
		{
			const tab = page.locator(`${CHAR_AREA} .ca-tab:has-text("Vows")`).first();
			await tab.click();
			await expect(tab).toHaveAttribute('data-state', 'active');
			await expect(
				page
					.locator(`${CHAR_AREA} .ca-vows-list`)
					.or(page.locator(`${CHAR_AREA} .ca-empty`, { hasText: /vows/i })),
			).toBeVisible({ timeout: 3_000 });
			// Other tabs' content should be gone.
			await expect(page.locator(`${CHAR_AREA} .ca-stats-row`)).toHaveCount(0);
		}

		// Assets: either .ca-asset-grid (when owned) or "No assets yet" hint.
		{
			const tab = page.locator(`${CHAR_AREA} .ca-tab:has-text("Assets")`).first();
			await tab.click();
			await expect(tab).toHaveAttribute('data-state', 'active');
			await expect(
				page
					.locator(`${CHAR_AREA} .ca-asset-grid`)
					.or(page.locator(`${CHAR_AREA} .ca-empty`, { hasText: /assets/i })),
			).toBeVisible({ timeout: 3_000 });
		}

		// Status: debilities + tracks. Debilities wrapper is unique to this tab.
		await expectTabActivates(
			page,
			`${CHAR_AREA} .ca-tab:has-text("Status")`,
			'ca-tab--active',
			`${CHAR_AREA} .ca-debilities-wrapper`,
		);
	});

	// ── Communities area ─────────────────────────────────────────────────────

	test('CommunitiesArea — every tab activates and renders its panel', async ({ page }) => {
		// Ensure a community exists and is active (its detail tabs render).
		await settleHome(page);
		if (
			!(await page
				.locator(`${CM_AREA} .cm-tab`)
				.first()
				.isVisible()
				.catch(() => false))
		) {
			await page.locator(`${CM_AREA} .cm-hdr-combobox`).click();
			await page.locator('.mp-cmd-item--action', { hasText: /New Settlement/i }).click();
			await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 15_000 });
			await page.locator('.confirm-modal .co-input').first().fill('E2E Community');
			await page.locator('.confirm-modal button:has-text("Create")').click();
			await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 10_000 });
		}
		await expect(page.locator(`${CM_AREA} .cm-tab`).first()).toBeVisible({ timeout: 5_000 });

		// Core: field rows + notes block.
		await expectTabActivates(
			page,
			`${CM_AREA} .cm-tab:has-text("Core")`,
			'cm-tab--active',
			`${CM_AREA} .cm-field-row`,
		);

		// Description: portrait uploader + notes (.cm-notes-section is the
		// container).
		await expectTabActivates(
			page,
			`${CM_AREA} .cm-tab:has-text("Description")`,
			'cm-tab--active',
			`${CM_AREA} .cm-notes-section`,
		);
	});

	// ── Expeditions area ─────────────────────────────────────────────────────

	test('ExpeditionsArea — every tab activates and renders its panel (journey)', async ({
		page,
	}) => {
		// Ensure a journey exists and is active (its detail tabs render).
		await settleHome(page);
		if (
			!(await page
				.locator(`${EXP_AREA} .ea-tab`)
				.first()
				.isVisible()
				.catch(() => false))
		) {
			await page.locator(`${EXP_AREA} .ea-hdr-combobox`).click();
			await page.locator('.mp-cmd-item--action', { hasText: /New Journey/i }).click();
			await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 10_000 });
			await page.locator('.confirm-modal .co-input').first().fill('E2E Journey');
			await page.locator('.confirm-modal button:has-text("Create")').click();
			await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 8_000 });
		}
		await expect(page.locator(`${EXP_AREA} .ea-tab`).first()).toBeVisible({ timeout: 5_000 });

		// Core: pills row (Journey badge + difficulty badge).
		await expectTabActivates(
			page,
			`${EXP_AREA} .ea-tab:has-text("Core")`,
			'ea-tab--active',
			`${EXP_AREA} .ea-pills-row`,
		);

		// Description: portrait + notes container.
		await expectTabActivates(
			page,
			`${EXP_AREA} .ea-tab:has-text("Description")`,
			'ea-tab--active',
			`${EXP_AREA} .ea-desc-section`,
		);
	});

	// ── Foes area ────────────────────────────────────────────────────────────

	test('FoesArea — every tab activates and renders its panel', async ({ page }) => {
		// Ensure a foe encounter exists and is active (its detail tabs render).
		await settleHome(page);
		if (
			!(await page
				.locator(`${FOE_AREA} .fa-tab`)
				.first()
				.isVisible()
				.catch(() => false))
		) {
			await page.locator(`${FOE_AREA} .fa-hdr-combobox`).click();
			await page.locator('.mp-cmd-item--action', { hasText: /New foe/i }).click();
			await expect(page.locator('.foe-dialog')).toBeVisible({ timeout: 8_000 });
			await page.locator('.foe-dialog .fd-tile').first().click();
			await page.locator('.foe-dialog button:has-text("Add to Foes")').click();
			await expect(page.locator('.foe-dialog')).not.toBeVisible({ timeout: 5_000 });
		}
		await expect(page.locator(`${FOE_AREA} .fa-tab`).first()).toBeVisible({ timeout: 5_000 });

		// Core: pills row.
		await expectTabActivates(
			page,
			`${FOE_AREA} .fa-tab:has-text("Core")`,
			'fa-tab--active',
			`${FOE_AREA} .fa-pills-row`,
		);

		// Description: desc section (portrait + features/drives/tactics).
		await expectTabActivates(
			page,
			`${FOE_AREA} .fa-tab:has-text("Description")`,
			'fa-tab--active',
			`${FOE_AREA} .fa-desc-section`,
		);
	});
});
