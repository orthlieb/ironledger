/**
 * foe-overrides.spec.ts — Expansion foe-override mechanism.
 *
 * An expansion may ship apps/api/data/foes/foes_overrides_<source>.json to
 *   • hide base foes that don't fit its setting (present: false)
 *   • append an addendum to a foe's description (addendum)
 * Overrides apply only while the owning expansion is enabled.
 *
 * These tests intercept /api/catalogue/foes so they verify the mechanism
 * itself, independent of whatever real overrides ship in foes_overrides_yrt.json.
 */
import { test, expect, type Page, type Route } from '@playwright/test';

const DELVE_KEY = 'ironledger:expansion:delve';
const YRT_KEY   = 'ironledger:expansion:yrt';

const BASE_FOE_A = {
	id:          'ironsworn/test-excluded',
	name:        'ZZZ Test Excluded',
	rank:        2,
	nature:      'Beast',
	features:    ['Sharp claws', 'Fanged jaw'],
	drives:      ['Hunt solitary prey'],
	tactics:     ['Ambush from shadow'],
	description: 'A base-setting creature that YRT excludes from its world.',
	source:      'base',
};

const BASE_FOE_B = {
	id:          'ironsworn/test-decorated',
	name:        'ZZZ Test Decorated',
	rank:        2,
	nature:      'Beast',
	features:    ['Matted fur', 'Steady gaze'],
	drives:      ['Defend its range'],
	tactics:     ['Charge intruders'],
	description: 'A base-setting creature that YRT keeps but re-explains.',
	source:      'base',
};

const YRT_ADDENDUM = 'In YRT, this beast is bound to Green mana and has persisted through the sundering.';

const FIXTURE_PAYLOAD = {
	foes: [BASE_FOE_A, BASE_FOE_B],
	overrides: [
		{
			source: 'yrt',
			overrides: {
				[BASE_FOE_A.id]: { present: false },
				[BASE_FOE_B.id]: { addendum: YRT_ADDENDUM },
			},
		},
	],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Reset the expansion toggles to defaults (both on). */
async function resetToggles(page: Page): Promise<void> {
	await page.evaluate(
		({ d, y }) => {
			localStorage.removeItem(d);
			localStorage.removeItem(y);
		},
		{ d: DELVE_KEY, y: YRT_KEY },
	);
}

/** Set toggles via localStorage (reload afterwards so stores re-hydrate). */
async function setToggles(page: Page, opts: { delve?: boolean; yrt?: boolean }): Promise<void> {
	await page.evaluate(
		({ d, y, delve, yrt }) => {
			if (delve === true) localStorage.removeItem(d); else if (delve === false) localStorage.setItem(d, 'off');
			if (yrt   === true) localStorage.removeItem(y); else if (yrt   === false) localStorage.setItem(y, 'off');
		},
		{ d: DELVE_KEY, y: YRT_KEY, delve: opts.delve, yrt: opts.yrt },
	);
}

/** Install a route that returns a controlled foe catalogue payload. */
async function stubFoesEndpoint(page: Page): Promise<void> {
	await page.route('**/api/catalogue/foes**', (route: Route) => {
		route.fulfill({
			status: 200,
			headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
			body:   JSON.stringify(FIXTURE_PAYLOAD),
		});
	});
}

/** Open the Foe Picker by going to the Foes tab and clicking + Foe. */
async function openFoePicker(page: Page): Promise<void> {
	await page.click('.tab-btn[data-tab="foes"]');
	// Wait for the foe list container — tab content re-renders after data loads,
	// so we must wait for the list to appear before the toolbar is stable.
	await expect(page.locator('.char-list--foes')).toBeVisible({ timeout: 12_000 });
	await page.locator('.char-toolbar button.btn-primary').first().click({ timeout: 8_000 });
	await expect(page.locator('dialog.foe-dialog[open]')).toBeVisible({ timeout: 8_000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Foe overrides — expansion exclusion + addendum', () => {

	test.beforeEach(async ({ page }) => {
		// Install the intercept BEFORE the initial navigation so loadFoes sees
		// the fixture, not real data.
		await stubFoesEndpoint(page);
		await page.goto('/home');
		await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 10_000 });
		await resetToggles(page);
		await page.reload();
		await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 10_000 });
	});

	test('YRT on: excluded foe is hidden from the picker', async ({ page }) => {
		// Both toggles default to ON after reset.
		await openFoePicker(page);
		await expect(page.locator('dialog.foe-dialog .fd-tile-name', { hasText: BASE_FOE_A.name }))
			.toHaveCount(0, { timeout: 5_000 });
		// Control: the decorated (non-excluded) foe still shows.
		await expect(page.locator('dialog.foe-dialog .fd-tile-name', { hasText: BASE_FOE_B.name }))
			.toHaveCount(1, { timeout: 5_000 });
		await page.keyboard.press('Escape');
	});

	test('YRT off: previously excluded foe reappears in the picker', async ({ page }) => {
		await setToggles(page, { yrt: false });
		await page.reload();
		await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 10_000 });

		await openFoePicker(page);
		await expect(page.locator('dialog.foe-dialog .fd-tile-name', { hasText: BASE_FOE_A.name }))
			.toHaveCount(1, { timeout: 5_000 });
		await page.keyboard.press('Escape');
	});

	test('YRT on: addendum is appended to the foe description', async ({ page }) => {
		await openFoePicker(page);
		await page.locator('dialog.foe-dialog .fd-tile', { has: page.locator('.fd-tile-name', { hasText: BASE_FOE_B.name }) })
			.first().click();

		const desc = page.locator('dialog.foe-dialog .fc-desc');
		await expect(desc).toBeVisible({ timeout: 5_000 });
		await expect(desc).toContainText(BASE_FOE_B.description);
		await expect(desc).toContainText(YRT_ADDENDUM);
		await page.keyboard.press('Escape');
	});

	test('YRT off: addendum is NOT shown even though the data is loaded', async ({ page }) => {
		await setToggles(page, { yrt: false });
		await page.reload();
		await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 10_000 });

		await openFoePicker(page);
		await page.locator('dialog.foe-dialog .fd-tile', { has: page.locator('.fd-tile-name', { hasText: BASE_FOE_B.name }) })
			.first().click();

		const desc = page.locator('dialog.foe-dialog .fc-desc');
		await expect(desc).toBeVisible({ timeout: 5_000 });
		await expect(desc).toContainText(BASE_FOE_B.description);
		await expect(desc).not.toContainText(YRT_ADDENDUM);
		await page.keyboard.press('Escape');
	});
});
