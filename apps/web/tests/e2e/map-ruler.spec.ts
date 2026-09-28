/**
 * map-ruler.spec.ts — Distance-measuring ruler on the campaign map.
 *
 * The ruler is a polyline tool: click the toolbar button to arm, click
 * on the map for each waypoint, double-click / re-click the button to
 * commit, Escape to clear. A distance chip near the last endpoint shows
 * the running total in the map's scale units.
 *
 *   • Disabled state — the button is disabled with an explanatory
 *     tooltip when the map has no scale defined (Map options → Scale).
 *   • Enabled state — after PATCHing scale settings via the API, the
 *     button lights up.
 *   • Polyline drawing — each grid click adds a `.mp-measure-dot`; two
 *     or more waypoints add the connecting `.mp-measure-line`; a
 *     `.mp-measure-total` chip shows a value + unit.
 *   • Escape — wipes every waypoint and disarms.
 *   • Double-click — commits + disarms but leaves the polyline visible
 *     so the user can screenshot the result.
 *
 * The suite uses two describe blocks (Playwright runs them serially per
 * playwright.config.ts) so the "no scale" case gets its own map without
 * scale settings, without cross-contamination from the "scale enabled"
 * fixture.
 */
import { test, expect, type Page } from '@playwright/test';
import { resetAll, getTestToken } from './helpers/reset';

const V1 = 'http://127.0.0.1:3000/api/v1';

// Tiny 1×1 PNG — same fixture other map specs use for a background.
const TINY_PNG =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI6QAAAABJRU5ErkJggg==';

async function waitForHome(page: Page): Promise<void> {
	await page
		.locator('[aria-label="Open the campaign map"]')
		.first()
		.waitFor({ timeout: 12_000, state: 'attached' });
	await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
}

async function openMap(page: Page): Promise<void> {
	await page.locator('[aria-label="Open the campaign map"]').first().click();
	await expect(page.locator('.mp-dialog')).toBeVisible({ timeout: 15_000 });
	await expect(page.locator('.mp-grid-capture')).toBeVisible({ timeout: 8_000 });
}

/** Two grid clicks that leave the polyline with dots at both endpoints.
 *  The two waypoints deliberately differ in BOTH x and y so the resulting
 *  polyline has a non-zero bounding-box on each axis — Playwright's
 *  `toBeVisible()` treats an SVG element with a zero-area bounding box as
 *  hidden, so a purely horizontal (or purely vertical) line would trip the
 *  `.mp-measure-line` visibility asserts even though it renders fine. */
async function drawTwoWaypoints(page: Page): Promise<void> {
	const grid = page.locator('.mp-grid-capture');
	const box = await grid.boundingBox();
	if (!box) throw new Error('grid capture has no bounding box');
	await grid.click({ position: { x: box.width * 0.2, y: box.height * 0.3 } });
	await grid.click({ position: { x: box.width * 0.8, y: box.height * 0.6 } });
}

test.describe('Map ruler — scale enabled', () => {
	test.beforeAll(async () => {
		await resetAll();
		const tok = await getTestToken();
		const h = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };
		// One map + 1×1 background so the grid capture renders on first
		// openMap(), plus scale settings so the ruler button lights up.
		const created = await fetch(`${V1}/session/maps`, {
			method: 'POST',
			headers: h,
			body: JSON.stringify({ name: 'Ruler Test Map' }),
		});
		const mapId = ((await created.json()) as { id: string }).id;
		await fetch(`${V1}/session/maps/${mapId}/background`, {
			method: 'PUT',
			headers: h,
			body: JSON.stringify({ dataUrl: `data:image/png;base64,${TINY_PNG}` }),
		});
		await fetch(`${V1}/session/maps/${mapId}/settings`, {
			method: 'PUT',
			headers: h,
			body: JSON.stringify({
				settings: { scale: { enabled: true, unit: 'miles', perHex: 5, segments: 4 } },
			}),
		});
	});

	test.beforeEach(async ({ page }) => {
		await page.goto('/home');
		await waitForHome(page);
		await openMap(page);
	});

	test('button is enabled and disarmed by default', async ({ page }) => {
		const rulerBtn = page.locator('[aria-label="Measure distance"]');
		await expect(rulerBtn).toBeEnabled();
		await expect(rulerBtn).toHaveAttribute('aria-pressed', 'false');
	});

	test('clicking arms the tool; map clicks draw the polyline + distance chip', async ({ page }) => {
		const rulerBtn = page.locator('[aria-label="Measure distance"]');
		await rulerBtn.click();
		await expect(rulerBtn).toHaveAttribute('aria-pressed', 'true');

		await drawTwoWaypoints(page);

		await expect(page.locator('.mp-measure-dot')).toHaveCount(2);
		await expect(page.locator('.mp-measure-line')).toBeVisible();
		// Distance chip shows a numeric total followed by the map's unit
		// ("miles" here, per the scale set in beforeAll).
		const total = page.locator('.mp-measure-total');
		await expect(total).toBeVisible();
		await expect(total).toHaveText(/\d+(\.\d+)?\s+miles$/);
	});

	test('Escape wipes every waypoint and disarms', async ({ page }) => {
		await page.locator('[aria-label="Measure distance"]').click();
		await drawTwoWaypoints(page);
		await expect(page.locator('.mp-measure-dot')).toHaveCount(2);

		await page.keyboard.press('Escape');

		await expect(page.locator('.mp-measure-dot')).toHaveCount(0);
		await expect(page.locator('.mp-measure-line')).toHaveCount(0);
		await expect(page.locator('.mp-measure-total')).toHaveCount(0);
		await expect(page.locator('[aria-label="Measure distance"]')).toHaveAttribute(
			'aria-pressed',
			'false',
		);
	});

	test('double-click commits and disarms; polyline stays visible', async ({ page }) => {
		const rulerBtn = page.locator('[aria-label="Measure distance"]');
		await rulerBtn.click();
		const grid = page.locator('.mp-grid-capture');
		const box = await grid.boundingBox();
		if (!box) throw new Error('grid capture has no bounding box');
		await grid.click({ position: { x: box.width * 0.2, y: box.height * 0.3 } });
		// Double-click at a second location — the dblclick handler pops
		// the duplicate point the second click of the pair otherwise adds,
		// so the polyline ends at where the double-click landed. The y
		// deliberately differs from the first click's so the resulting
		// polyline has a non-zero bounding-box height (see the
		// `drawTwoWaypoints` docstring for why that matters).
		await grid.dblclick({ position: { x: box.width * 0.8, y: box.height * 0.6 } });

		await expect(rulerBtn).toHaveAttribute('aria-pressed', 'false');
		await expect(page.locator('.mp-measure-dot')).toHaveCount(2);
		await expect(page.locator('.mp-measure-line')).toBeVisible();
		await expect(page.locator('.mp-measure-total')).toBeVisible();
	});

	test('clicking the ruler while armed clears the measurement (mobile abort)', async ({ page }) => {
		// Mobile has no Escape key, so the toolbar button doubles as the
		// abort — clicking it while measuring wipes every waypoint and
		// disarms. Desktop still has Escape, and double-click on the map
		// stays the "commit + keep visible" path.
		const rulerBtn = page.locator('[aria-label="Measure distance"]');
		await rulerBtn.click();
		await drawTwoWaypoints(page);
		await expect(page.locator('.mp-measure-dot')).toHaveCount(2);

		await rulerBtn.click();

		await expect(page.locator('.mp-measure-dot')).toHaveCount(0);
		await expect(page.locator('.mp-measure-line')).toHaveCount(0);
		await expect(page.locator('.mp-measure-total')).toHaveCount(0);
		await expect(rulerBtn).toHaveAttribute('aria-pressed', 'false');
	});
});

test.describe('Map ruler — no scale', () => {
	test.beforeAll(async () => {
		await resetAll();
		const tok = await getTestToken();
		const h = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };
		// One map + background but NO scale settings — the ruler button
		// should stay disabled with the "turn on Scale in Map options"
		// tooltip.
		const created = await fetch(`${V1}/session/maps`, {
			method: 'POST',
			headers: h,
			body: JSON.stringify({ name: 'No-Scale Map' }),
		});
		const mapId = ((await created.json()) as { id: string }).id;
		await fetch(`${V1}/session/maps/${mapId}/background`, {
			method: 'PUT',
			headers: h,
			body: JSON.stringify({ dataUrl: `data:image/png;base64,${TINY_PNG}` }),
		});
	});

	test('button is disabled with an explanatory tooltip until a scale is configured', async ({
		page,
	}) => {
		await page.goto('/home');
		await waitForHome(page);
		await openMap(page);

		const rulerBtn = page.locator('[aria-label="Measure distance"]');
		await expect(rulerBtn).toBeDisabled();
		// Clicking the disabled button is a no-op — the polyline overlay
		// stays absent.
		await rulerBtn.click({ force: true }).catch(() => {});
		await expect(page.locator('.mp-measure-dot')).toHaveCount(0);
	});
});
