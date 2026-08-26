/**
 * expansion-toggles.spec.ts — Delve / YRT expansion toggles (v2).
 *
 * Verifies:
 *   • Both expansions read as ON at start — Delve via its manifest default,
 *     YRT forced on for E2E (production ships YRT with defaultEnabled:false).
 *   • Disabling Delve hides Delve moves, oracles, foes, and the "+ Site" button.
 *   • Disabling YRT hides YRT moves, oracles, and foes.
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
const LODESTAR_KEY = 'ironledger:expansion:lodestar';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function resetExpansionToggles(page: Page): Promise<void> {
	await page.evaluate(
		({ delveKey, yrtKey, lodestarKey }) => {
			localStorage.removeItem(delveKey);
			// Production ships YRT with defaultEnabled:false, but these toggle tests
			// exercise it as an enabled expansion — force it ON for E2E only. (The
			// store reads 'on'/'off' from localStorage, falling back to the manifest
			// default only when the key is absent.)
			localStorage.setItem(yrtKey, 'on');
			localStorage.removeItem(lodestarKey);
		},
		{ delveKey: DELVE_KEY, yrtKey: YRT_KEY, lodestarKey: LODESTAR_KEY },
	);
}

async function setExpansionsViaStorage(
	page: Page,
	opts: { delve?: boolean; yrt?: boolean; lodestar?: boolean },
): Promise<void> {
	await page.evaluate(
		({ delveKey, yrtKey, lodestarKey, delve, yrt, lodestar }) => {
			if (delve === true) localStorage.removeItem(delveKey);
			else if (delve === false) localStorage.setItem(delveKey, 'off');
			if (yrt === true) localStorage.removeItem(yrtKey);
			else if (yrt === false) localStorage.setItem(yrtKey, 'off');
			if (lodestar === true) localStorage.removeItem(lodestarKey);
			else if (lodestar === false) localStorage.setItem(lodestarKey, 'off');
		},
		{
			delveKey: DELVE_KEY,
			yrtKey: YRT_KEY,
			lodestarKey: LODESTAR_KEY,
			delve: opts.delve,
			yrt: opts.yrt,
			lodestar: opts.lodestar,
		},
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
	// Settings is tabbed (Appearance / Dice / Expansions / AI); the expansion
	// toggles live behind the Expansions tab, so activate it.
	await page.locator('.sd-tab', { hasText: /^Expansions$/ }).click();
	await expect(page.locator('.sd-tab-panel:not([hidden])')).toBeVisible({ timeout: 3_000 });
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
		// Lodestar ships its own "Face Danger" (Scene category) alongside the
		// base Adventure move — either being visible proves the base + non-Delve
		// moves still render, so .first() disambiguates and keeps the assertion.
		await expect(
			page.locator('.moves-dialog .md-tile-name', { hasText: /^Face Danger$/ }).first(),
		).toBeVisible({ timeout: 5_000 });
	});

	test('Delve off: Delve oracles hidden from Oracles picker', async ({ page }) => {
		await setExpansionsViaStorage(page, { delve: false });
		await openOraclesDialog(page);
		await expect(
			page.locator('.oracles-dialog .od-tile-name', { hasText: /Site Nature: Theme/i }),
		).toHaveCount(0, { timeout: 5_000 });
		await expect(
			page.locator('.oracles-dialog .od-tile-name', { hasText: /^Core: Action$/ }),
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
			page.locator('.oracles-dialog .od-tile-name', { hasText: /Magic: Ritual Backlash/i }),
		).toBeVisible({ timeout: 5_000 });
	});

	// (The old "YRT region radio hidden in community creation" test was removed:
	// the New Settlement dialog no longer has a region-oracle picker — Region is
	// auto (base or YRT) and controlled by an Also-randomize checkbox. Coverage
	// of the new dialog lives in communities.spec.ts.)

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

	// ── 7. NewNPC dialog — Character oracle checkboxes gate on extensions ────
	//
	// Guards the concept resolver (resolveCharacterConcept) behavior visible
	// in the UI: the three roll-me checkboxes for First Look, Activity, and
	// Disposition each render only when their backing oracle is currently
	// visible. Role/Goal/Revealed Details are base — always shown.

	async function openNewNpc(page: Page) {
		await page.locator(`${CM_HEADER} .cm-hdr-combobox`).click();
		await page.locator('.mp-cmd-item--action', { hasText: /New NPC/i }).click();
		await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 8_000 });
	}
	const checkboxLabel = (page: Page, label: string) =>
		page.locator('.confirm-modal .nn-check-label', { hasText: new RegExp(`^${label}$`) });

	test('NewNPC: all six Character checkboxes present with Delve + Lodestar on', async ({
		page,
	}) => {
		await openNewNpc(page);
		for (const label of [
			'First Look',
			'Activity',
			'Disposition',
			'Role',
			'Goal',
			'Revealed Details',
		]) {
			await expect(checkboxLabel(page, label)).toHaveCount(1);
		}
		await page.keyboard.press('Escape');
	});

	test('NewNPC with Lodestar off: First Look checkbox absent, others remain', async ({ page }) => {
		await setExpansionsViaStorage(page, { lodestar: false });
		await openNewNpc(page);
		await expect(checkboxLabel(page, 'First Look')).toHaveCount(0);
		// Activity + Disposition still present (Delve still on; disposition falls back to base charDisposition).
		for (const label of ['Activity', 'Disposition', 'Role', 'Goal', 'Revealed Details']) {
			await expect(checkboxLabel(page, label)).toHaveCount(1);
		}
		await page.keyboard.press('Escape');
	});

	test('NewNPC with Delve + Lodestar off: only the three base checkboxes remain', async ({
		page,
	}) => {
		await setExpansionsViaStorage(page, { delve: false, lodestar: false });
		await openNewNpc(page);
		for (const absent of ['First Look', 'Activity', 'Disposition']) {
			await expect(checkboxLabel(page, absent)).toHaveCount(0);
		}
		for (const present of ['Role', 'Goal', 'Revealed Details']) {
			await expect(checkboxLabel(page, present)).toHaveCount(1);
		}
		await page.keyboard.press('Escape');
	});

	// ── 8. NPC card fields — data survives extension toggle-off ──────────────

	test('NPC card keeps rendering firstLook after Lodestar is turned off', async ({ page }) => {
		// Create an NPC with all defaults (Lodestar on → firstLook populated).
		await openNewNpc(page);
		await page.locator('.confirm-modal .co-input').first().fill('Test NPC firstLook');
		await page.locator('.confirm-modal button:has-text("Create")').click();
		await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 8_000 });

		// The First Look input on the active card should be populated.
		const firstLookRow = page.locator(`${CM_AREA} .cm-field-row`, {
			has: page.locator('.cm-field-label', { hasText: /^First Look$/ }),
		});
		await expect(firstLookRow).toBeVisible({ timeout: 5_000 });
		const firstLookInput = firstLookRow.locator('.cm-input');
		await expect(firstLookInput).not.toHaveValue('');

		// Toggle Lodestar off and reload — the concept oracle becomes unavailable
		// but the saved value must not disappear (fallback: {#if n.firstLook || ...}).
		await setExpansionsViaStorage(page, { lodestar: false });

		// After reload the same NPC is still the active card.
		await expect(firstLookRow).toBeVisible({ timeout: 5_000 });
		await expect(firstLookInput).not.toHaveValue('');
	});
});
