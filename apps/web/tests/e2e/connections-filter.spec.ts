/**
 * connections-filter.spec.ts — Connections rail: type filter, sort toggle, and
 * per-browser persistence (the foe-style "Filters ▼" panel + clear button +
 * A–Z ⇄ recently-added sort toggle).
 *
 * Seeds exactly one community and one NPC so filtering changes the visible
 * count and the two entries' names (Zzz… / Aaa…) make sort order observable.
 * Persistence keys: ironledger:connections:filter / :sort.
 */
import { test, expect, type Page } from '@playwright/test';
import { resetCommunities, seedCommunity, seedNpc, getTestToken } from './helpers/reset';

const CM_AREA = '.home-area--communities';
const ROW = `${CM_AREA} .cm-row`;
const FILTER_TOGGLE = `${CM_AREA} .cm-filter-toggle`;
const FILTER_PANEL = `${CM_AREA} .cm-filter-panel`;
const FILTER_BADGE = `${CM_AREA} .cm-filter-badge`;
const CLEAR_BTN = `${CM_AREA} .cm-clear-btn`;
const SORT_TOGGLE = `${CM_AREA} .cm-sort-toggle`;

const COMMUNITY_NAME = 'Zzz Test Community';
const NPC_NAME = 'Aaa Test NPC';

const FILTER_KEY = 'ironledger:connections:filter';
const SORT_KEY = 'ironledger:connections:sort';

/** Both seeded entries are loaded into the rail. */
async function waitForSeededRows(page: Page) {
	await expect(page.locator(`${CM_AREA} .cm-loading`)).not.toBeVisible({ timeout: 10_000 });
	await expect(page.locator(ROW)).toHaveCount(2, { timeout: 10_000 });
}

/** Open the Filters panel if it isn't already open. */
async function openFilters(page: Page) {
	if ((await page.locator(FILTER_PANEL).count()) === 0) {
		await page.locator(FILTER_TOGGLE).click();
		await expect(page.locator(FILTER_PANEL)).toBeVisible();
	}
}

/** Click a Type chip in the filter panel by its label. */
async function pickType(page: Page, label: 'All' | 'Communities' | 'NPCs') {
	await openFilters(page);
	await page.locator(FILTER_PANEL).getByRole('button', { name: label, exact: true }).click();
}

test.describe('Connections rail — filter, sort & persistence (v2)', () => {
	test.beforeAll(async () => {
		const tok = await getTestToken();
		await resetCommunities(tok);
		// Seed community first so its createdAt precedes the NPC's: "added" order
		// is [community, npc], while A–Z order is [Aaa NPC, Zzz Community].
		await seedCommunity(COMMUNITY_NAME, tok);
		await seedNpc(NPC_NAME, tok);
	});

	test.afterAll(async () => {
		await resetCommunities();
	});

	test.beforeEach(async ({ page }) => {
		await page.goto('/home');
		await waitForSeededRows(page);
	});

	test('Filters panel toggles open and shows the three Type chips', async ({ page }) => {
		await expect(page.locator(FILTER_PANEL)).toHaveCount(0); // closed by default
		await page.locator(FILTER_TOGGLE).click();
		await expect(page.locator(FILTER_PANEL)).toBeVisible();
		await expect(page.locator(`${FILTER_PANEL} .cm-filter-tag`)).toHaveText([
			'All',
			'Communities',
			'NPCs',
		]);
	});

	test('selecting a Type narrows the rail and shows the count badge', async ({ page }) => {
		await pickType(page, 'Communities');
		await expect(page.locator(ROW)).toHaveCount(1);
		await expect(page.locator(ROW)).toContainText(COMMUNITY_NAME);
		await expect(page.locator(FILTER_BADGE)).toHaveText('1');
		await expect(page.locator(FILTER_TOGGLE)).toHaveClass(/has-filters/);

		await pickType(page, 'NPCs');
		await expect(page.locator(ROW)).toHaveCount(1);
		await expect(page.locator(ROW)).toContainText(NPC_NAME);
	});

	test('clear button resets to All, hides the badge, and re-disables', async ({ page }) => {
		await pickType(page, 'Communities');
		await expect(page.locator(CLEAR_BTN)).toBeEnabled();

		await page.locator(CLEAR_BTN).click();
		await expect(page.locator(ROW)).toHaveCount(2); // both entries back
		await expect(page.locator(FILTER_BADGE)).toHaveCount(0); // badge gone
		await expect(page.locator(CLEAR_BTN)).toBeDisabled();
	});

	test('sort toggle flips A–Z ⇄ recently added and reorders the rail', async ({ page }) => {
		// Default is "added": community (seeded first) sorts before the NPC.
		await expect(page.locator(ROW).first()).toContainText(COMMUNITY_NAME);

		await page.locator(SORT_TOGGLE).click(); // -> A–Z
		await expect(page.locator(ROW).first()).toContainText(NPC_NAME);
		await expect(page.locator(SORT_TOGGLE)).toHaveAttribute('aria-label', /Sorted A.Z/);

		await page.locator(SORT_TOGGLE).click(); // back to added
		await expect(page.locator(ROW).first()).toContainText(COMMUNITY_NAME);
	});

	test('filter + sort persist across a full page reload', async ({ page }) => {
		await pickType(page, 'Communities');
		await page.locator(SORT_TOGGLE).click(); // added -> A–Z

		// localStorage reflects the choices before reload.
		await expect
			.poll(() => page.evaluate((k) => localStorage.getItem(k), FILTER_KEY))
			.toBe('community');
		await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), SORT_KEY)).toBe('name');

		await page.reload();
		await expect(page.locator(`${CM_AREA} .cm-loading`)).not.toBeVisible({ timeout: 10_000 });

		// Filter restored from storage (rail filtered + badge + has-filters).
		await expect(page.locator(ROW)).toHaveCount(1);
		await expect(page.locator(ROW)).toContainText(COMMUNITY_NAME);
		await expect(page.locator(FILTER_BADGE)).toHaveText('1');
		await expect(page.locator(FILTER_TOGGLE)).toHaveClass(/has-filters/);

		// Sort restored from storage (toggle reflects A–Z; panel state is NOT persisted).
		await expect(page.locator(SORT_TOGGLE)).toHaveAttribute('aria-label', /Sorted A.Z/);
		await expect(page.locator(FILTER_PANEL)).toHaveCount(0);
		expect(await page.evaluate((k) => localStorage.getItem(k), SORT_KEY)).toBe('name');
	});
});
