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
 *   • Toggles persist across page reloads, and follow the user to another
 *     browser: they're kept on the account (/api/session/extensions).
 *   • Re-enabling restores visibility.
 *
 * v2 changes: the Move / Ask / Roll / Note buttons are in `.app-nav`, not the
 * Adventure tab; the "+ Site" button lives in the Expeditions area header.
 */
import { test, expect, type Page } from '@playwright/test';
import { ensureCharacter } from './helpers/home';
import { resetCommunities, resetExpansions, setExpansions } from './helpers/reset';

const CHAR_AREA = '.home-area--characters';
const FOE_AREA = '.home-area--foes';
const FOE_HEADER = `${FOE_AREA} .fa-header`;
const EXP_AREA = '.home-area--expeditions';
const EXP_HEADER = `${EXP_AREA} .ea-header`;
const CM_AREA = '.home-area--communities';
const CM_HEADER = `${CM_AREA} .cm-header`;
const APP_NAV = '.app-nav';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Delve and Lodestar at their defaults (on), YRT on: production ships YRT
 *  with defaultEnabled:false, but these toggle tests exercise it as an
 *  enabled expansion. Kept on the account, so a page loaded after reads it. */
async function resetExpansionToggles(): Promise<void> {
	await setExpansions({ delve: null, yrt: true, lodestar: null });
}

/** Set choices on the account, then reload so the stores re-hydrate. */
async function setExpansionsOnAccount(
	page: Page,
	opts: { delve?: boolean; yrt?: boolean; lodestar?: boolean },
): Promise<void> {
	await setExpansions(
		Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)) as Record<
			string,
			boolean
		>,
	);
	await page.reload();
	await waitForHome(page);
}

/** Click a Settings toggle, and wait for its choice to reach the account. */
async function toggleAndSave(page: Page, label: string, state: 'On' | 'Off'): Promise<void> {
	await Promise.all([
		page.waitForResponse(
			(r) => r.url().includes('/api/session/extensions') && r.request().method() === 'PATCH',
		),
		settingsToggleButton(page, label, state).click(),
	]);
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
		// Server-side clean slate so the "firstLook survives Lodestar off" test
		// (line 377) actually sees its own just-created NPC as entries[0] after
		// reload — without this, an NPC persisted by a previous run of this
		// same spec on the same fixture user stays behind, becomes entries[0]
		// (oldest by createdAt), and activeEntry rehydrates to that old NPC
		// (which has no firstLook), so the row assertion fails on the wrong
		// card. The other tests in this describe don't create NPCs, so
		// clearing the collection is a no-op for them.
		await resetCommunities();
		await resetExpansionToggles();
		await goHome(page);
	});

	// The choices outlast the spec: back to the defaults for the specs after.
	test.afterAll(async () => {
		await resetExpansions();
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
		await setExpansionsOnAccount(page, { delve: false });
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
		await setExpansionsOnAccount(page, { delve: false });
		await openOraclesDialog(page);
		await expect(
			page.locator('.oracles-dialog .od-tile-name', { hasText: /Site Nature: Theme/i }),
		).toHaveCount(0, { timeout: 5_000 });
		await expect(
			page.locator('.oracles-dialog .od-tile-name', { hasText: /^Core: Action$/ }),
		).toBeVisible({ timeout: 5_000 });
	});

	test('Delve off: "+ New Site…" hidden in the Expeditions switcher', async ({ page }) => {
		await setExpansionsOnAccount(page, { delve: false });
		// The switcher still offers "+ New Journey…" but not "+ New Site…".
		await page.locator(`${EXP_HEADER} .ea-hdr-combobox`).click();
		await expect(page.locator('.cb-item--action', { hasText: /New Journey/i })).toBeVisible({
			timeout: 5_000,
		});
		await expect(page.locator('.cb-item--action', { hasText: /New Site/i })).toHaveCount(0, {
			timeout: 5_000,
		});
		await page.keyboard.press('Escape');
	});

	test('Delve off: Delve foes hidden from Foe picker', async ({ page }) => {
		await setExpansionsOnAccount(page, { delve: false });
		await page.locator(`${FOE_HEADER} .fa-hdr-combobox`).click();
		await page.locator('.cb-item--action', { hasText: /New foe/i }).click();
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
		await setExpansionsOnAccount(page, { yrt: false });
		await openMovesDialog(page);
		await expect(
			page.locator('.moves-dialog .md-tile-name', { hasText: /Cast Conclave Ritual/i }),
		).toHaveCount(0, { timeout: 5_000 });
	});

	test('YRT off: YRT oracles hidden from Oracles picker', async ({ page }) => {
		await setExpansionsOnAccount(page, { yrt: false });
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
		await setExpansionsOnAccount(page, { delve: false });

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
		await toggleAndSave(page, 'Delve', 'Off');
		await toggleAndSave(page, 'YRT', 'Off');
		await page.keyboard.press('Escape');
		await page.reload();
		await waitForHome(page);

		await openSettings(page);
		await expect(settingsToggleButton(page, 'Delve', 'Off')).toHaveAttribute('data-state', 'on');
		await expect(settingsToggleButton(page, 'YRT', 'Off')).toHaveAttribute('data-state', 'on');
	});

	test('toggles follow the user to another browser', async ({ page, browser }, testInfo) => {
		// Made in this browser…
		await openSettings(page);
		await toggleAndSave(page, 'Delve', 'Off');
		await page.keyboard.press('Escape');

		// …and seen in a fresh one (the same sign-in, nothing in its storage).
		const other = await browser.newContext({ storageState: testInfo.project.use.storageState });
		try {
			const page2 = await other.newPage();
			await goHome(page2);
			await openSettings(page2);
			await expect(settingsToggleButton(page2, 'Delve', 'Off')).toHaveAttribute('data-state', 'on');
			await expect(settingsToggleButton(page2, 'YRT', 'On')).toHaveAttribute('data-state', 'on');
		} finally {
			await other.close();
		}
	});

	// ── 6. Re-enable restores visibility ──────────────────────────────────────

	test('re-enabling Delve restores picker visibility', async ({ page }) => {
		await setExpansionsOnAccount(page, { delve: false });
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
		await page.locator('.cb-item--action', { hasText: /New NPC/i }).click();
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
		await setExpansionsOnAccount(page, { lodestar: false });
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
		await setExpansionsOnAccount(page, { delve: false, lodestar: false });
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
		// setExpansionsViaStorage already does page.reload() + waitForHome; the
		// waitForHome BEFORE it is the fix — without it the newly added NPC and
		// its rolled firstLook value may not have persisted to the session blob
		// yet, so the reload rehydrates a stub NPC and the "value survives reload"
		// assertion below is testing nothing (element-not-found rather than
		// element-with-empty-value).
		await waitForHome(page);
		await setExpansionsOnAccount(page, { lodestar: false });

		// After reload the same NPC is still the active card.
		await expect(firstLookRow).toBeVisible({ timeout: 5_000 });
		await expect(firstLookInput).not.toHaveValue('');
	});
});
