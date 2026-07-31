/**
 * expansion-toggles.spec.ts — Delve / YRT expansion toggles (v2).
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
 * v2 changes: the Move / Ask / Roll / Note buttons are in `.app-nav`, not the
 * Adventure tab; the "+ Site" button lives in the Expeditions area header.
 */
import { test, expect, type Page } from '@playwright/test';
import { ensureCharacter } from './helpers/home';

const CHAR_AREA = '.home-area--characters';
const FOE_AREA = '.home-area--foes';
const FOE_HEADER = `${FOE_AREA} .fa-header`;
const EXP_AREA = '.home-area--expeditions';
const EXP_HEADER = `${EXP_AREA} .ea-header`;
const CM_AREA = '.home-area--communities';
const CM_HEADER = `${CM_AREA} .cm-header`;
const APP_NAV = '.app-nav';

const DELVE_KEY = 'ironledger:expansion:delve';
const YRT_KEY = 'ironledger:expansion:yrt';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function resetExpansionToggles(page: Page): Promise<void> {
	await page.evaluate(
		({ delveKey, yrtKey }) => {
			localStorage.removeItem(delveKey);
			localStorage.removeItem(yrtKey);
		},
		{ delveKey: DELVE_KEY, yrtKey: YRT_KEY },
	);
}

async function setExpansionsViaStorage(
	page: Page,
	opts: { delve?: boolean; yrt?: boolean },
): Promise<void> {
	await page.evaluate(
		({ delveKey, yrtKey, delve, yrt }) => {
			if (delve === true) localStorage.removeItem(delveKey);
			else if (delve === false) localStorage.setItem(delveKey, 'off');
			if (yrt === true) localStorage.removeItem(yrtKey);
			else if (yrt === false) localStorage.setItem(yrtKey, 'off');
		},
		{ delveKey: DELVE_KEY, yrtKey: YRT_KEY, delve: opts.delve, yrt: opts.yrt },
	);
	await page.reload();
	await waitForHome(page);
}

async function openSettings(page: Page): Promise<void> {
	// HamburgerMenu is a bits-ui DropdownMenu — Content portals with class
	// `.hm-menu`, items with `.hm-item`. The Trigger keeps its `.hamburger-btn`
	// class from before the migration.
	await page.locator('.hamburger-btn').click();
	await page.locator('.hm-menu').waitFor({ state: 'visible', timeout: 3_000 });
	await page.locator('.hm-item', { hasText: /settings/i }).click();
	await expect(page.locator('.settings-dialog')).toBeVisible({ timeout: 3_000 });
}

function settingsToggleButton(page: Page, label: string, state: 'On' | 'Off') {
	return page
		.locator('.sd-row', {
			has: page.locator('.sd-label', { hasText: new RegExp(`^${label}$`, 'i') }),
		})
		.locator('.sd-seg-btn', { hasText: new RegExp(`^${state}$`, 'i') });
}

/** Open the Moves dialog via the global app-nav button. */
async function openMovesDialog(page: Page): Promise<void> {
	await page.locator(`${APP_NAV} .act-btn`, { hasText: 'Move' }).first().click();
	await expect(page.locator('.moves-dialog')).toBeVisible({ timeout: 8_000 });
}

/** Open the Oracles dialog via the global app-nav button. */
async function openOraclesDialog(page: Page): Promise<void> {
	await page.locator(`${APP_NAV} .act-btn`, { hasText: 'Ask' }).first().click();
	await expect(page.locator('.oracles-dialog')).toBeVisible({ timeout: 8_000 });
}

async function waitForHome(page: Page): Promise<void> {
	await page.waitForLoadState('networkidle', { timeout: 15_000 });
	await expect(page.locator(`${CHAR_AREA} .ca-loading`)).not.toBeVisible({ timeout: 12_000 });
	await page
		.locator(`${CHAR_AREA} .ca-empty, ${CHAR_AREA} .ca-body`)
		.first()
		.waitFor({ timeout: 12_000, state: 'attached' });
}

async function goHome(page: Page): Promise<void> {
	await page.goto('/home');
	await waitForHome(page);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Expansion toggles — Delve / YRT', () => {
	test.beforeEach(async ({ page }) => {
		await goHome(page);
		await resetExpansionToggles(page);
		await page.reload();
		await waitForHome(page);
	});

	// ── 1. Defaults ───────────────────────────────────────────────────────────

	test('both expansions default to ON', async ({ page }) => {
		await openSettings(page);
		await expect(settingsToggleButton(page, 'Delve', 'On')).toHaveAttribute('data-state', 'on');
		await expect(settingsToggleButton(page, 'YRT', 'On')).toHaveAttribute('data-state', 'on');
	});

	test('default: Delve moves appear in Moves dialog', async ({ page }) => {
		await openMovesDialog(page);
		await expect(
			page.locator('.moves-dialog .md-tile-name', { hasText: /^Discover a Site$/ }),
		).toBeVisible({ timeout: 5_000 });
	});

	test('default: YRT oracle appears in Oracles dialog', async ({ page }) => {
		await openOraclesDialog(page);
		await expect(
			page.locator('.oracles-dialog .od-tile-name', { hasText: /Mana Backlash/ }),
		).toBeVisible({ timeout: 5_000 });
	});

	// ── 2. Disabling Delve ────────────────────────────────────────────────────

	test('Delve off: Delve moves hidden from Moves picker', async ({ page }) => {
		await setExpansionsViaStorage(page, { delve: false });
		await openMovesDialog(page);
		await expect(
			page.locator('.moves-dialog .md-tile-name', { hasText: /^Discover a Site$/ }),
		).toHaveCount(0, { timeout: 5_000 });
		await expect(
			page.locator('.moves-dialog .md-tile-name', { hasText: /^Face Danger$/ }),
		).toBeVisible({ timeout: 5_000 });
	});

	test('Delve off: Delve oracles hidden from Oracles picker', async ({ page }) => {
		await setExpansionsViaStorage(page, { delve: false });
		await openOraclesDialog(page);
		await expect(
			page.locator('.oracles-dialog .od-tile-name', { hasText: /Site Nature: Theme/i }),
		).toHaveCount(0, { timeout: 5_000 });
		await expect(
			page.locator('.oracles-dialog .od-tile-name', { hasText: /^Action$/ }),
		).toBeVisible({ timeout: 5_000 });
	});

	test('Delve off: "+ New Site…" hidden in the Expeditions switcher', async ({ page }) => {
		await setExpansionsViaStorage(page, { delve: false });
		// The switcher still offers "+ New Journey…" but not "+ New Site…".
		await page.locator(`${EXP_HEADER} .ea-hdr-combobox`).click();
		await expect(page.locator('.mp-cmd-item--action', { hasText: /New Journey/i })).toBeVisible({
			timeout: 5_000,
		});
		await expect(page.locator('.mp-cmd-item--action', { hasText: /New Site/i })).toHaveCount(0, {
			timeout: 5_000,
		});
		await page.keyboard.press('Escape');
	});

	test('Delve off: Delve foes hidden from Foe picker', async ({ page }) => {
		await setExpansionsViaStorage(page, { delve: false });
		await page.locator(`${FOE_HEADER} .fa-hdr-combobox`).click();
		await page.locator('.mp-cmd-item--action', { hasText: /New foe/i }).click();
		await expect(page.locator('.foe-dialog')).toBeVisible({ timeout: 8_000 });
		await expect(page.locator('.foe-dialog .fd-tile-name', { hasText: /^Bladewing$/ })).toHaveCount(
			0,
			{ timeout: 3_000 },
		);
		await expect(page.locator('.foe-dialog .fd-tile-name', { hasText: /^Basilisk$/ })).toHaveCount(
			1,
			{ timeout: 3_000 },
		);
		await page.keyboard.press('Escape');
	});

	// ── 3. Disabling YRT ──────────────────────────────────────────────────────

	test('YRT off: YRT moves hidden from Moves picker', async ({ page }) => {
		await setExpansionsViaStorage(page, { yrt: false });
		await openMovesDialog(page);
		await expect(
			page.locator('.moves-dialog .md-tile-name', { hasText: /Cast Conclave Ritual/i }),
		).toHaveCount(0, { timeout: 5_000 });
	});

	test('YRT off: YRT oracles hidden from Oracles picker', async ({ page }) => {
		await setExpansionsViaStorage(page, { yrt: false });
		await openOraclesDialog(page);
		await expect(
			page.locator('.oracles-dialog .od-tile-name', { hasText: /Mana Backlash/ }),
		).toHaveCount(0, { timeout: 5_000 });
		await expect(
			page.locator('.oracles-dialog .od-tile-name', { hasText: /Mystic Backlash/i }),
		).toBeVisible({ timeout: 5_000 });
	});

	test('YRT off: YRT region radio hidden in community creation', async ({ page }) => {
		await setExpansionsViaStorage(page, { yrt: false });
		// Wait for communities area to render.
		await expect(page.locator(`${CM_AREA} .cm-loading`)).not.toBeVisible({ timeout: 12_000 });
		await page
			.locator(`${CM_AREA} .cm-empty, ${CM_AREA} .cm-body`)
			.first()
			.waitFor({ timeout: 12_000, state: 'attached' });

		await page.locator(`${CM_HEADER} .cm-hdr-combobox`).click({ timeout: 8_000 });
		await page.locator('.mp-cmd-item--action', { hasText: /New Community/i }).click();

		// The New Community dialog now picks its region from a bits-ui <Select>
		// (#nc-region). With YRT off, the option list must offer Ironlands but
		// not YRT. Open the select and inspect its portalled items.
		const openDialog = page.locator('.confirm-modal');
		await expect(openDialog).toBeVisible({ timeout: 8_000 });
		await openDialog.locator('#nc-region').click();
		const items = page.locator('.bui-select-content .bui-select-item');
		await expect(items.filter({ hasText: /^Ironlands$/ })).toHaveCount(1, { timeout: 3_000 });
		await expect(items.filter({ hasText: /^YRT$/ })).toHaveCount(0);
		await page.keyboard.press('Escape'); // close the select
		await page.keyboard.press('Escape'); // close the dialog
	});

	// ── 4. Render-time resolution (find* is never filtered) ──────────────────

	test('Delve off: log link to a Delve move still opens the move', async ({ page }) => {
		await setExpansionsViaStorage(page, { delve: false });

		// Ensure a character exists so the log can attach entries.
		await ensureCharacter(page);

		// Inject a log entry containing a link to a Delve move.
		const entryId = 'e2e-delve-off-move-link';
		await page.waitForFunction(
			() => !!(window as unknown as { __testLog?: unknown }).__testLog,
			undefined,
			{ timeout: 8_000 },
		);
		await page.evaluate(
			({ id }) => {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(window as any).__testLog.appendLog(
					'E2E Delve link',
					`<div>See <a class="move-link" data-id="move/discover-a-site">Discover a Site</a></div>`,
					id,
				);
			},
			{ id: entryId },
		);

		const link = page.locator(`.log-entry[data-entry-id="${entryId}"] .move-link`);
		await expect(link).toBeVisible({ timeout: 5_000 });
		await link.click();

		await expect(page.locator('.moves-dialog')).toBeVisible({ timeout: 5_000 });
		await expect(
			page
				.locator('.moves-dialog')
				.getByText(/Discover a Site/i)
				.first(),
		).toBeVisible({ timeout: 5_000 });
		await page.keyboard.press('Escape');
	});

	// ── 5. Persistence ────────────────────────────────────────────────────────

	test('toggles persist across page reload', async ({ page }) => {
		await openSettings(page);
		await settingsToggleButton(page, 'Delve', 'Off').click();
		await settingsToggleButton(page, 'YRT', 'Off').click();
		await page.keyboard.press('Escape');
		await page.reload();
		await waitForHome(page);

		await openSettings(page);
		await expect(settingsToggleButton(page, 'Delve', 'Off')).toHaveAttribute('data-state', 'on');
		await expect(settingsToggleButton(page, 'YRT', 'Off')).toHaveAttribute('data-state', 'on');
	});

	// ── 6. Re-enable restores visibility ──────────────────────────────────────

	test('re-enabling Delve restores picker visibility', async ({ page }) => {
		await setExpansionsViaStorage(page, { delve: false });
		await openMovesDialog(page);
		await expect(page.locator('.moves-dialog').getByText(/Discover a Site/i)).toHaveCount(0, {
			timeout: 5_000,
		});
		await page.keyboard.press('Escape');

		await openSettings(page);
		await settingsToggleButton(page, 'Delve', 'On').click();
		await page.keyboard.press('Escape');

		await openMovesDialog(page);
		await expect(
			page
				.locator('.moves-dialog')
				.getByText(/Discover a Site/i)
				.first(),
		).toBeVisible({ timeout: 5_000 });
		await page.keyboard.press('Escape');
	});
});
