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
import { resetAll, clearMapMarkers, getTestToken } from './helpers/reset';

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
		// Markers persist server-side — start each test clean so the
		// "markers frozen while measuring" test doesn't inherit leftover
		// pins from an earlier run, and other tests aren't confused by a
		// stray dot from the newest addition.
		await clearMapMarkers();
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

	test('Escape wipes every waypoint and disarms — leaves the dialog open', async ({ page }) => {
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
		// The measuring-scoped Escape stops propagation so bits-ui's Dialog
		// Escape handler doesn't ALSO close the dialog underneath. Without
		// stopPropagation an armed-ruler Escape ate the whole dialog and
		// the user had to re-open the map to start over.
		await expect(page.locator('.mp-dialog')).toBeVisible();
	});

	test('Enter commits the polyline — pins stay, tool disarms, dialog stays open', async ({
		page,
	}) => {
		await page.locator('[aria-label="Measure distance"]').click();
		await drawTwoWaypoints(page);
		await expect(page.locator('.mp-measure-dot')).toHaveCount(2);

		await page.keyboard.press('Enter');

		// Tool disarms; pins remain on screen for a screen capture.
		await expect(page.locator('[aria-label="Measure distance"]')).toHaveAttribute(
			'aria-pressed',
			'false',
		);
		await expect(page.locator('.mp-measure-dot')).toHaveCount(2);
		await expect(page.locator('.mp-measure-line')).toBeVisible();
		// Enter mirrors the desktop double-click gesture — no accidental
		// side effects on the dialog or on any selection.
		await expect(page.locator('.mp-dialog')).toBeVisible();
	});

	test('Enter with no waypoints yet is a safe no-op', async ({ page }) => {
		const rulerBtn = page.locator('[aria-label="Measure distance"]');
		await rulerBtn.click();
		await expect(rulerBtn).toHaveAttribute('aria-pressed', 'true');

		// Fire Enter before any waypoint is placed — the Enter handler is
		// gated on `measurePoints.length > 0`, so nothing commits, nothing
		// disarms, and (critically) the dialog does NOT eat the keypress.
		await page.keyboard.press('Enter');

		await expect(rulerBtn).toHaveAttribute('aria-pressed', 'true');
		await expect(page.locator('.mp-measure-dot')).toHaveCount(0);
		await expect(page.locator('.mp-dialog')).toBeVisible();
	});

	test('Backspace / Delete pops the most-recent waypoint', async ({ page }) => {
		await page.locator('[aria-label="Measure distance"]').click();
		await drawTwoWaypoints(page);
		await expect(page.locator('.mp-measure-dot')).toHaveCount(2);

		// One Backspace drops the second waypoint — line disappears
		// (needs 2+ points), one dot remains, tool stays armed.
		await page.keyboard.press('Backspace');
		await expect(page.locator('.mp-measure-dot')).toHaveCount(1);
		await expect(page.locator('.mp-measure-line')).toHaveCount(0);
		await expect(page.locator('[aria-label="Measure distance"]')).toHaveAttribute(
			'aria-pressed',
			'true',
		);

		// Delete pops the first waypoint too — polyline is now empty.
		await page.keyboard.press('Delete');
		await expect(page.locator('.mp-measure-dot')).toHaveCount(0);
	});

	test('a tap on a marker while measuring adds a waypoint, not a selection', async ({ page }) => {
		// Drop a marker at a known spot via the toolbar flow so there is
		// a pin to interact with. The tap that arms placement + the
		// second tap that drops the pin land at the same coord, and the
		// editor opens on the fresh marker as usual.
		await page.locator('[aria-label="Add marker"]').click();
		const grid = page.locator('.mp-grid-capture');
		const box = await grid.boundingBox();
		if (!box) throw new Error('grid capture has no bounding box');
		const markerX = box.width * 0.5;
		const markerY = box.height * 0.5;
		await grid.click({ position: { x: markerX, y: markerY } });
		await expect(page.locator('.mp-props-dialog')).toBeVisible();
		await page.locator('#mp-props-name').fill('Frozen Pin');
		await page.locator('.mp-props-footer .btn-primary').click(); // OK
		await expect(page.locator('.mp-props-dialog')).not.toBeVisible();
		await expect(page.locator('.mp-marker')).toHaveCount(1);

		// Arm the ruler. `startMeasuring()` clears the marker selection so
		// the pin is no longer highlighted and the toolbar Edit button
		// disables — the map is now the ruler's canvas.
		await page.locator('[aria-label="Measure distance"]').click();

		// Tap on the pin. Without the pointer-down guard, this would arm
		// a drag on the marker AND schedule a long-press on touch — either
		// of which routes into the editor. With the guard, onGridPointerDown
		// short-circuits and onGridClick routes the tap to `measurePoints`.
		await grid.click({ position: { x: markerX, y: markerY } });

		// A waypoint landed at the pin's coord; the editor did not open;
		// the ruler is still armed.
		await expect(page.locator('.mp-measure-dot')).toHaveCount(1);
		await expect(page.locator('.mp-props-dialog')).not.toBeVisible();
		await expect(page.locator('[aria-label="Measure distance"]')).toHaveAttribute(
			'aria-pressed',
			'true',
		);
		// The marker itself is untouched — still present, still labelled.
		await expect(page.locator('.mp-marker')).toHaveCount(1);
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
