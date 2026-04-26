/**
 * expansion-toggles.spec.ts — Delve / YRT expansion toggles.
 *
 * Verifies:
 *   • Both expansions default to ON (fresh storage).
 *   • Disabling Delve hides Delve moves, oracles, foes, and the "+ Site" button.
 *   • Disabling YRT hides YRT moves, oracles, foes, and the YRT region radio.
 *   • find*-style resolution is NEVER filtered — a log link to a disabled-expansion
 *     move still opens in the MovesDialog (render-time resolution contract).
 *   • Toggles persist across page reloads (localStorage).
 *   • Re-enabling restores visibility.
 *
 * Each test resets localStorage so prior tests can't leak toggle state.
 */
import { test, expect, type Page } from '@playwright/test';

const DELVE_KEY = 'ironledger:expansion:delve';
const YRT_KEY   = 'ironledger:expansion:yrt';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Reset expansion toggles to default (both ON) before each test. */
async function resetExpansionToggles(page: Page): Promise<void> {
	await page.evaluate(
		({ delveKey, yrtKey }) => {
			localStorage.removeItem(delveKey);
			localStorage.removeItem(yrtKey);
		},
		{ delveKey: DELVE_KEY, yrtKey: YRT_KEY },
	);
}

/** Force a specific toggle state via localStorage, then reload so stores re-hydrate. */
async function setExpansionsViaStorage(
	page: Page,
	opts: { delve?: boolean; yrt?: boolean },
): Promise<void> {
	await page.evaluate(
		({ delveKey, yrtKey, delve, yrt }) => {
			if (delve === true)       localStorage.removeItem(delveKey);
			else if (delve === false) localStorage.setItem(delveKey, 'off');
			if (yrt === true)         localStorage.removeItem(yrtKey);
			else if (yrt === false)   localStorage.setItem(yrtKey, 'off');
		},
		{ delveKey: DELVE_KEY, yrtKey: YRT_KEY, delve: opts.delve, yrt: opts.yrt },
	);
	await page.reload();
	await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 8_000 });
}

/** Open the Settings dialog via the hamburger menu. */
async function openSettings(page: Page): Promise<void> {
	await page.locator('.hamburger-btn').click();
	await page.locator('.menu-item', { hasText: /settings/i }).click();
	await expect(page.locator('dialog.settings-dialog[open]')).toBeVisible({ timeout: 3_000 });
}

/** Locate the On/Off button within a settings row by its label. */
function settingsToggleButton(page: Page, label: string, state: 'On' | 'Off') {
	return page
		.locator('.sd-row', { has: page.locator('.sd-label', { hasText: new RegExp(`^${label}$`, 'i') }) })
		.locator('.sd-seg-btn', { hasText: new RegExp(`^${state}$`, 'i') });
}

/** Open the Moves dialog picker from the adventure tab. */
async function openMovesDialog(page: Page): Promise<void> {
	await page.click('.tab-btn[data-tab="adventure"]');
	await expect(page.locator('.adventure-gcb')).toBeVisible({ timeout: 10_000 });
	// The Moves action button has title="Browse and roll moves" and label "Move"
	await page.locator('.act-btn[title*="move" i]').first().click();
	await expect(page.locator('dialog.moves-dialog[open]')).toBeVisible({ timeout: 8_000 });
}

/** Open the Oracles dialog picker from the adventure tab. */
async function openOraclesDialog(page: Page): Promise<void> {
	await page.click('.tab-btn[data-tab="adventure"]');
	await expect(page.locator('.adventure-gcb')).toBeVisible({ timeout: 10_000 });
	await page.locator('.act-btn[title*="oracle" i]').first().click();
	await expect(page.locator('dialog.oracles-dialog[open]')).toBeVisible({ timeout: 8_000 });
}

/** Navigate to /home and wait for initial hydration. */
async function goHome(page: Page): Promise<void> {
	await page.goto('/home');
	await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 10_000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Expansion toggles — Delve / YRT', () => {

	test.beforeEach(async ({ page }) => {
		await goHome(page);
		await resetExpansionToggles(page);
		await page.reload();
		await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 10_000 });
	});

	// ── 1. Defaults ───────────────────────────────────────────────────────────

	test('both expansions default to ON', async ({ page }) => {
		await openSettings(page);
		await expect(settingsToggleButton(page, 'Delve', 'On')).toHaveClass(/\bactive\b/);
		await expect(settingsToggleButton(page, 'YRT',   'On')).toHaveClass(/\bactive\b/);
	});

	test('default: Delve moves appear in Moves dialog', async ({ page }) => {
		await openMovesDialog(page);
		await expect(page.locator('.moves-dialog .md-tile-name', { hasText: /^Discover a Site$/ }))
			.toBeVisible({ timeout: 5_000 });
	});

	test('default: YRT oracle appears in Oracles dialog', async ({ page }) => {
		await openOraclesDialog(page);
		await expect(page.locator('.oracles-dialog .od-tile-name', { hasText: /Mana Backlash/ }))
			.toBeVisible({ timeout: 5_000 });
	});

	// ── 2. Disabling Delve ────────────────────────────────────────────────────

	test('Delve off: Delve moves hidden from Moves picker', async ({ page }) => {
		await setExpansionsViaStorage(page, { delve: false });
		await openMovesDialog(page);
		await expect(page.locator('.moves-dialog .md-tile-name', { hasText: /^Discover a Site$/ }))
			.toHaveCount(0, { timeout: 5_000 });
		// A base move must still be visible (sanity check)
		await expect(page.locator('.moves-dialog .md-tile-name', { hasText: /^Face Danger$/ }))
			.toBeVisible({ timeout: 5_000 });
	});

	test('Delve off: Delve oracles hidden from Oracles picker', async ({ page }) => {
		await setExpansionsViaStorage(page, { delve: false });
		await openOraclesDialog(page);
		// "Site Nature: Theme" is Delve-only
		await expect(page.locator('.oracles-dialog .od-tile-name', { hasText: /Site Nature: Theme/i }))
			.toHaveCount(0, { timeout: 5_000 });
		// Base "Action" oracle still visible
		await expect(page.locator('.oracles-dialog .od-tile-name', { hasText: /^Action$/ }))
			.toBeVisible({ timeout: 5_000 });
	});

	test('Delve off: "+ Site" button hidden on Expeditions tab', async ({ page }) => {
		await setExpansionsViaStorage(page, { delve: false });
		await page.click('.tab-btn[data-tab="expeditions"]');
		await expect(page.locator('.char-toolbar')).toBeVisible({ timeout: 5_000 });
		await expect(page.locator('.char-toolbar button', { hasText: /\bjourney\b/i }).first())
			.toBeVisible({ timeout: 5_000 });
		await expect(page.locator('.char-toolbar button', { hasText: /\+ ?site/i }))
			.toHaveCount(0, { timeout: 5_000 });
	});

	test('Delve off: Delve foes hidden from Foe picker', async ({ page }) => {
		await setExpansionsViaStorage(page, { delve: false });
		await page.click('.tab-btn[data-tab="foes"]');
		await expect(page.locator('.char-toolbar button.btn-primary').first())
			.toBeVisible({ timeout: 10_000 });
		await page.locator('.char-toolbar button.btn-primary').first().click();
		await expect(page.locator('dialog.foe-dialog[open]')).toBeVisible({ timeout: 8_000 });
		// "Bladewing" is in foes_delve.json — should be absent
		await expect(page.locator('dialog.foe-dialog .fd-tile-name', { hasText: /^Bladewing$/ }))
			.toHaveCount(0, { timeout: 3_000 });
		// "Basilisk" is in foes_ironsworn.json — should still be present
		await expect(page.locator('dialog.foe-dialog .fd-tile-name', { hasText: /^Basilisk$/ }))
			.toHaveCount(1, { timeout: 3_000 });
		await page.keyboard.press('Escape');
	});

	// ── 3. Disabling YRT ──────────────────────────────────────────────────────

	test('YRT off: YRT moves hidden from Moves picker', async ({ page }) => {
		await setExpansionsViaStorage(page, { yrt: false });
		await openMovesDialog(page);
		await expect(page.locator('.moves-dialog .md-tile-name', { hasText: /Cast Conclave Ritual/i }))
			.toHaveCount(0, { timeout: 5_000 });
	});

	test('YRT off: YRT oracles hidden from Oracles picker', async ({ page }) => {
		await setExpansionsViaStorage(page, { yrt: false });
		await openOraclesDialog(page);
		await expect(page.locator('.oracles-dialog .od-tile-name', { hasText: /Mana Backlash/ }))
			.toHaveCount(0, { timeout: 5_000 });
		// Base "Mystic Backlash" still visible (source=base, not YRT)
		await expect(page.locator('.oracles-dialog .od-tile-name', { hasText: /Mystic Backlash/i }))
			.toBeVisible({ timeout: 5_000 });
	});

	test('YRT off: YRT region radio hidden in community creation', async ({ page }) => {
		await setExpansionsViaStorage(page, { yrt: false });
		await page.click('.tab-btn[data-tab="communities"]');
		await expect(page.locator('.char-toolbar')).toBeVisible({ timeout: 10_000 });
		await page.locator('.char-toolbar button', { hasText: /community/i }).first().click();
		// Find the "Create Manually" path to reach the region radio, or the Generate one.
		const createManualBtn = page.getByRole('button', { name: /create manually/i });
		if (await createManualBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
			await createManualBtn.click();
		}
		// The region fieldset legend reads "Region oracle"; YRT radio has a sibling label "YRT".
		const yrtRadio = page.locator('input[type="radio"][value="yrt"]');
		await expect(yrtRadio).toHaveCount(0);
		// Ironlands radio must remain
		await expect(page.locator('input[type="radio"][value="ironlands"]'))
			.toHaveCount(1, { timeout: 3_000 });
		await page.keyboard.press('Escape');
	});

	// ── 4. Render-time resolution (find* is never filtered) ──────────────────

	test('Delve off: log link to a Delve move still opens the move', async ({ page }) => {
		await setExpansionsViaStorage(page, { delve: false });

		// Select a character so the adventure tab + log are active
		await page.click('.tab-btn[data-tab="characters"]');
		await page.locator('.char-list--characters > .char-card, .empty-tab').first()
			.waitFor({ timeout: 8_000, state: 'attached' });
		const charCards = page.locator('.char-list--characters > .char-card');
		if (await charCards.count() === 0) {
			await page.click('.char-toolbar button.btn-primary');
			await expect(page.locator('.char-card--active')).toBeVisible({ timeout: 5_000 });
		} else {
			await charCards.first().click();
		}

		await page.click('.tab-btn[data-tab="adventure"]');
		await expect(page.locator('.adventure-gcb')).toBeVisible({ timeout: 5_000 });

		// Inject a log entry containing a link to a Delve move.
		const entryId = 'e2e-delve-off-move-link';
		await page.evaluate(
			({ id }) => {
				(window as any).__testLog.appendLog(
					'__session__',
					'E2E Delve link',
					`<div>See <a class="move-link" data-id="move/discover-a-site">Discover a Site</a></div>`,
					id,
				);
			},
			{ id: entryId },
		);

		// Click the injected move-link — MovesDialog.open(id) should resolve via findMove
		// even though Delve is disabled (render-time resolution contract).
		const link = page.locator(`.log-entry[data-entry-id="${entryId}"] .move-link`);
		await expect(link).toBeVisible({ timeout: 5_000 });
		await link.click();

		await expect(page.locator('dialog.moves-dialog[open]')).toBeVisible({ timeout: 5_000 });
		await expect(page.locator('dialog.moves-dialog').getByText(/Discover a Site/i).first())
			.toBeVisible({ timeout: 5_000 });
		await page.keyboard.press('Escape');
	});

	// ── 5. Persistence ────────────────────────────────────────────────────────

	test('toggles persist across page reload', async ({ page }) => {
		await openSettings(page);
		await settingsToggleButton(page, 'Delve', 'Off').click();
		await settingsToggleButton(page, 'YRT',   'Off').click();
		// Close and reload
		await page.keyboard.press('Escape');
		await page.reload();
		await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 10_000 });

		await openSettings(page);
		await expect(settingsToggleButton(page, 'Delve', 'Off')).toHaveClass(/\bactive\b/);
		await expect(settingsToggleButton(page, 'YRT',   'Off')).toHaveClass(/\bactive\b/);
	});

	// ── 6. Re-enable restores visibility ──────────────────────────────────────

	test('re-enabling Delve restores picker visibility', async ({ page }) => {
		await setExpansionsViaStorage(page, { delve: false });
		await openMovesDialog(page);
		await expect(page.locator('.moves-dialog').getByText(/Discover a Site/i))
			.toHaveCount(0, { timeout: 5_000 });
		await page.keyboard.press('Escape');

		// Toggle back on via Settings UI
		await openSettings(page);
		await settingsToggleButton(page, 'Delve', 'On').click();
		await page.keyboard.press('Escape');

		await openMovesDialog(page);
		await expect(page.locator('.moves-dialog').getByText(/Discover a Site/i).first())
			.toBeVisible({ timeout: 5_000 });
		await page.keyboard.press('Escape');
	});

	// Note: no afterAll cleanup needed — each Playwright test starts with a
	// fresh browser context loaded from storageState (setup.ts), which does
	// not include the expansion toggle keys, so they default to "on" for
	// subsequent specs.
});
