/**
 * scenes.spec.ts — Scene Challenge (a third expedition type).
 *
 * A Scene is a bounded, high-stakes challenge that lives alongside Journeys
 * and Sites in the Expeditions area. Unlike its siblings it's non-map-spatial
 * (no map affordance in the header, no marker chips on Core), collapses to a
 * single "Core" tab (no Description / Denizens), and carries two extras: a
 * free-text `consequences` line and a 4-segment countdown clock that fills as
 * the fiction runs out of time.
 *
 * Coverage:
 *   - New Scene dialog from the header combobox — name required, rank
 *     select limited to Troublesome/Dangerous/Formidable per Begin the Scene
 *   - Create + delete, header count bump / drop
 *   - "Scene" pill on Core
 *   - Objective + consequences persist through inline edits
 *   - Countdown widget: click-to-fill through N, click topmost to clear
 *   - Non-map-spatial: header map "+" button is hidden
 *   - Scene tab set is Core-only (no Description, no Denizens)
 */
import { test, expect, type Page } from '@playwright/test';
import { resetExpeditions } from './helpers/reset';

const EXP_AREA = '.home-area--expeditions';
const EXP_HEADER = `${EXP_AREA} .ea-header`;
const EXP_COMBOBOX = `${EXP_HEADER} .ea-hdr-combobox`;
const EXP_ACTIONS = `${EXP_AREA} .ea-header-actions`;

async function waitForExpeditionsLoaded(page: Page) {
	await expect(page.locator(`${EXP_AREA} .ea-loading`)).not.toBeVisible({ timeout: 10_000 });
	await page
		.locator(`${EXP_AREA} .ea-empty, ${EXP_AREA} .ea-body`)
		.first()
		.waitFor({ timeout: 10_000, state: 'attached' });
	await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
}

async function expCount(page: Page): Promise<number> {
	return Number((await page.locator(EXP_ACTIONS).getAttribute('data-exp-count')) ?? '0');
}

/** Open "+ New Scene…" from the header combobox and wait for the dialog. */
async function openNewSceneDialog(page: Page) {
	await page.locator(EXP_COMBOBOX).click();
	await page.locator('.mp-cmd-item--action', { hasText: /New Scene/ }).click();
	await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 5_000 });
	await expect(page.locator('.confirm-modal .cm-title')).toContainText('New Scene');
}

/** Create a scene via the header combobox. The scene becomes active on close.
 *  Only `name` is required — objective and rank default to the dialog values. */
async function createScene(
	page: Page,
	{ name = 'E2E Scene', objective = '' }: { name?: string; objective?: string } = {},
) {
	await openNewSceneDialog(page);
	await page.locator('.confirm-modal .co-input').nth(0).fill(name);
	if (objective) await page.locator('.confirm-modal .co-input').nth(1).fill(objective);
	await page.locator('.confirm-modal button:has-text("Create")').click();
	await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 5_000 });
}

/** Header gear → Options dialog → Delete → confirm. Mirrors expeditions.spec.ts. */
async function deleteActiveExpedition(page: Page) {
	await page.locator(`${EXP_HEADER} .ea-hdr-settings-btn`).click();
	await page.locator('.co-dialog button.btn-danger').click();
	const confirm = page.locator('.confirm-modal button.btn-danger');
	await expect(confirm).toBeVisible({ timeout: 5_000 });
	await confirm.click();
	await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 5_000 });
}

test.describe('Expeditions area (v2) — Scene Challenge', () => {
	test.beforeAll(async () => {
		await resetExpeditions();
	});

	test.beforeEach(async ({ page }) => {
		await page.goto('/home');
		await waitForExpeditionsLoaded(page);
	});

	test('the switcher opens the new-scene dialog with name, objective, and rank', async ({
		page,
	}) => {
		await openNewSceneDialog(page);
		// Two text inputs (name, objective) + a rank select (bits-ui trigger).
		await expect(page.locator('.confirm-modal .co-input')).toHaveCount(2);
		await expect(page.locator('.confirm-modal #nsc-difficulty')).toBeVisible();

		// Create button starts disabled until a name is entered.
		const create = page.locator('.confirm-modal button:has-text("Create")');
		await expect(create).toBeDisabled();
		await page.locator('.confirm-modal .co-input').first().fill('X');
		await expect(create).toBeEnabled();

		await page.keyboard.press('Escape');
	});

	test('rank select is limited to Troublesome / Dangerous / Formidable', async ({ page }) => {
		await openNewSceneDialog(page);
		// bits-ui Select — click the trigger, count portalled options.
		await page.locator('.confirm-modal #nsc-difficulty').click();
		const items = page.locator('.bui-select-content .bui-select-item');
		await expect(items).toHaveCount(3);
		await expect(items.nth(0)).toContainText(/Troublesome/i);
		await expect(items.nth(1)).toContainText(/Dangerous/i);
		await expect(items.nth(2)).toContainText(/Formidable/i);
		await page.keyboard.press('Escape');
		await page.keyboard.press('Escape');
	});

	test('creating a scene bumps the header count and lands on a Scene badge', async ({ page }) => {
		const before = await expCount(page);
		await createScene(page, { name: 'A tense meeting', objective: 'Convince the elder' });
		expect(await expCount(page)).toBe(before + 1);

		// The pill row on Core reads "Scene" (not Journey / Site).
		await expect(page.locator(`${EXP_AREA} .ea-badge--scene`)).toHaveText(/Scene/);
	});

	test('scene deletes back to the previous count', async ({ page }) => {
		await createScene(page);
		const before = await expCount(page);
		await deleteActiveExpedition(page);
		expect(await expCount(page)).toBe(before - 1);
	});

	test('scene has a single Core tab (no Description / Denizens)', async ({ page }) => {
		await createScene(page);
		const tabs = page.locator(`${EXP_AREA} .ea-tab`);
		await expect(tabs).toHaveCount(1);
		await expect(tabs.first()).toContainText(/Core/i);
	});

	test('objective + consequences round-trip through inline edits on Core', async ({ page }) => {
		await createScene(page, { name: 'A tense meeting', objective: 'Initial goal' });

		const objective = page.locator(`${EXP_AREA} input[id^="ea-obj-"]`).first();
		const consequences = page.locator(`${EXP_AREA} input[id^="ea-cons-"]`).first();

		await expect(objective).toHaveValue('Initial goal');
		await expect(consequences).toHaveValue('');

		// ExpeditionsArea auto-saves through a 1.5 s trailing debounce, and each
		// updateExp() call flushes the *previous* pending save (via the effect's
		// teardown) — so back-to-back fills leave only the last edit still on the
		// timer at reload time. Wait for the PATCH the second fill kicks off to
		// hit the wire before we navigate away.
		const pendingPatch = page.waitForResponse(
			(r) =>
				r.url().includes('/api/session/expeditions/') && r.request().method() === 'PATCH' && r.ok(),
			{ timeout: 5_000 },
		);
		await objective.fill('Convince the elder');
		await consequences.fill('The village turns on us');
		await consequences.blur();
		await pendingPatch;
		// Belt-and-braces: give the second (still-debounced) save its 1.5 s and
		// wait for its PATCH to land too. Guarded so a coalesced single PATCH
		// doesn't hang the test.
		await page
			.waitForResponse(
				(r) =>
					r.url().includes('/api/session/expeditions/') &&
					r.request().method() === 'PATCH' &&
					r.ok(),
				{ timeout: 3_000 },
			)
			.catch(() => {});
		await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});

		await page.reload();
		await waitForExpeditionsLoaded(page);
		await expect(page.locator(`${EXP_AREA} input[id^="ea-obj-"]`).first()).toHaveValue(
			'Convince the elder',
		);
		await expect(page.locator(`${EXP_AREA} input[id^="ea-cons-"]`).first()).toHaveValue(
			'The village turns on us',
		);
	});

	test('countdown fills through the clicked segment and clears the topmost one', async ({
		page,
	}) => {
		await createScene(page, { name: 'Running out of time' });

		const boxes = page.locator(`${EXP_AREA} .countdown-boxes .countdown-box`);
		await expect(boxes).toHaveCount(4);
		await expect(boxes.locator('.filled')).toHaveCount(0);
		await expect(page.locator(`${EXP_AREA} .countdown-readout`)).toHaveText('0/4');

		// Click the third segment (index 2) → fill through index 2 → 3/4 filled.
		await boxes.nth(2).click();
		await expect(page.locator(`${EXP_AREA} .countdown-box.filled`)).toHaveCount(3);
		await expect(page.locator(`${EXP_AREA} .countdown-readout`)).toHaveText('3/4');

		// Click the topmost filled (index 2) again → drop back to 2/4.
		await boxes.nth(2).click();
		await expect(page.locator(`${EXP_AREA} .countdown-box.filled`)).toHaveCount(2);
		await expect(page.locator(`${EXP_AREA} .countdown-readout`)).toHaveText('2/4');
	});

	test('scenes are non-map-spatial — the header map "+" button is hidden', async ({ page }) => {
		await createScene(page);
		// Journeys/Sites show a map add or open icon-button in the header actions
		// area; scenes must not. The gear (options) button stays visible.
		await expect(page.locator(`${EXP_HEADER} .ea-hdr-icon-btn`)).toHaveCount(0);
		await expect(page.locator(`${EXP_HEADER} .ea-hdr-settings-btn`)).toBeVisible();
	});
});
