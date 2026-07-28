/**
 * import-collision.spec.ts — ImportCollisionDialog.
 *
 * When an import file contains rows whose NAMES already exist in the
 * active session, a dialog opens offering four outcomes:
 *
 *   • 'new'     — regenerate the incoming id; both versions coexist
 *   • 'replace' — overwrite the existing row; existing id is preserved
 *   • 'skip'    — drop the colliding incoming row; existing untouched
 *   • 'cancel'  — abort the whole import; nothing applied
 *
 * Detection is by lowercased + trimmed name — IDs are deliberately
 * ignored so that cross-user transfers (export from user A, import to
 * user B) still flag duplicates. The dialog lists each colliding row by
 * name, grouped by category (Characters / Communities / NPCs / Journeys /
 * Sites), and must not appear at all when the file has no collisions.
 */
import { test, expect, type Page } from '@playwright/test';
import { zipSync, strToU8 } from 'fflate';
import { resetAll } from './helpers/reset';

// ── Test fixtures ────────────────────────────────────────────────────────────

/** Bare-bones Community row. */
function makeCommunity(id: string, name: string, extras: Record<string, unknown> = {}) {
	return {
		id,
		name,
		region: '',
		location: '',
		locationDescription: '',
		trouble: '',
		notes: '',
		...extras,
	};
}

/** Bare-bones NPC row. */
function makeNpc(id: string, name: string, extras: Record<string, unknown> = {}) {
	return {
		id,
		name,
		role: '',
		goal: '',
		descriptor: '',
		relationship: 'friendly' as const,
		location: '',
		notes: '',
		...extras,
	};
}

/** Bare-bones Place row (mirrors the Community field set). */
function makePlace(id: string, name: string, extras: Record<string, unknown> = {}) {
	return {
		id,
		name,
		region: '',
		location: '',
		locationDescription: '',
		trouble: '',
		notes: '',
		...extras,
	};
}

/** Bare-bones Site (an Expedition discriminator = 'site'). */
function makeSite(id: string, name: string) {
	return {
		id,
		type: 'site' as const,
		name,
		ticks: 0,
		notes: '',
		theme: 'Ancient',
		domain: 'Tanglewood',
		rank: 'dangerous' as const,
	};
}

/** Bare-bones Journey (an Expedition discriminator = 'journey'). */
function makeJourney(id: string, name: string) {
	return {
		id,
		type: 'journey' as const,
		name,
		ticks: 0,
		notes: '',
		difficulty: 'dangerous' as const,
	};
}

/** Tag a payload with the manifest `type` the importer switches on
 *  (`communities`, `everything`, …). The returned tuple is unpacked
 *  by `importPayload` and packed into a real `.zip` via `zipEnvelope`
 *  right before it hits the file input. Kept as a helper so the test
 *  bodies read as declaratively as they did with the pre-zip JSON
 *  envelope. */
type Envelope = readonly [type: string, data: unknown];
function envelope(type: string, data: unknown): Envelope {
	return [type, data];
}

/** Build a `.zip` bundle in the shape `parseImportZip` accepts:
 *  a top-level `manifest.json` + a body file at `everything.json`
 *  (the first name in `BODY_CANDIDATES`). Legacy bare-JSON imports
 *  were retired when the export format switched to zip, so every
 *  test fixture now travels through the same zip pipeline the
 *  real exporter produces. */
function zipEnvelope(type: string, data: unknown): Buffer {
	const manifest = {
		app: 'Iron Ledger',
		version: '1.0.0',
		exportedAt: '2024-01-01T00:00:00.000Z',
		type,
		count: 0,
	};
	const bytes = zipSync({
		'manifest.json': strToU8(JSON.stringify(manifest)),
		'everything.json': strToU8(JSON.stringify(data)),
	});
	return Buffer.from(bytes);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function gotoHome(page: Page) {
	await page.goto('/home');
	await expect(page.locator('.home-area--characters .ca-loading')).not.toBeVisible({
		timeout: 12_000,
	});
	await page
		.locator('.home-area--characters .ca-empty, .home-area--characters .ca-body')
		.first()
		.waitFor({ timeout: 12_000, state: 'attached' });
}

/** Push a tagged payload through the hidden `<input type="file">` on
 *  the home page. The tuple is packed into a real `.zip` archive
 *  (manifest + body) before it hits the input — the importer only
 *  accepts `.zip` bundles now. */
async function importPayload(page: Page, [type, data]: Envelope) {
	await page.locator('input[type="file"][accept=".zip,application/zip"]').setInputFiles({
		name: 'test.zip',
		mimeType: 'application/zip',
		buffer: zipEnvelope(type, data),
	});
}

/** Read current Communities / NPCs / Expeditions through the SvelteKit BFF. */
async function readWorld(page: Page) {
	return await page.evaluate(async () => {
		const res = await fetch('/api/session', { credentials: 'include' });
		const j = (await res.json()) as {
			communities?: Array<{ id: string; name: string; trouble?: string }>;
			npcs?: Array<{ id: string; name: string; notes?: string }>;
			places?: Array<{ id: string; name: string; trouble?: string }>;
			expeditions?: Array<{ id: string; name: string; type: string }>;
		};
		return {
			communities: j.communities ?? [],
			npcs: j.npcs ?? [],
			places: j.places ?? [],
			expeditions: j.expeditions ?? [],
		};
	});
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Import collision dialog (name-based)', () => {
	test.beforeAll(async () => {
		await resetAll();
	});

	test.beforeEach(async ({ page }) => {
		await resetAll();
		await gotoHome(page);
	});

	test('no dialog opens on a clean-slate import', async ({ page }) => {
		await importPayload(
			page,
			envelope('communities', {
				communities: [makeCommunity('c-1', 'Skara Brae')],
				npcs: [makeNpc('n-1', 'Old Vala')],
			}),
		);
		await page.waitForTimeout(1_500);
		await expect(page.locator('.icd-dialog')).not.toBeVisible();
		const world = await readWorld(page);
		expect(world.communities).toHaveLength(1);
		expect(world.npcs).toHaveLength(1);
	});

	test('no dialog when only the IDs match but names differ (no longer a collision)', async ({
		page,
	}) => {
		await importPayload(
			page,
			envelope('communities', {
				communities: [makeCommunity('c-1', 'Skara Brae')],
				npcs: [],
			}),
		);
		await page.waitForTimeout(1_500);

		// Same id, different name → not a collision under name-based detection.
		await importPayload(
			page,
			envelope('communities', {
				communities: [makeCommunity('c-1', 'Westcliff')],
				npcs: [],
			}),
		);
		await page.waitForTimeout(1_500);
		await expect(page.locator('.icd-dialog')).not.toBeVisible();
	});

	test('opens and lists colliding rows grouped by category (incl. places + journeys / sites split)', async ({
		page,
	}) => {
		// First import — establishes the rows.
		await importPayload(
			page,
			envelope('everything', {
				characters: [],
				log: [],
				communities: [makeCommunity('c-1', 'Skara Brae'), makeCommunity('c-2', 'Westcliff')],
				npcs: [makeNpc('n-1', 'Old Vala'), makeNpc('n-2', 'Brokk the Smith')],
				places: [makePlace('p-1', 'The Silver Fish')],
				expeditions: [
					makeJourney('j-1', 'Road to the Black Spire'),
					makeSite('s-1', 'The Black Spire'),
				],
				foes: [],
				session: {},
			}),
		);
		await page.waitForTimeout(1_800);

		// Second import — same NAMES but fresh ids (simulates a cross-user
		// transfer). Collision dialog should open and list every category,
		// including the new Place category.
		await importPayload(
			page,
			envelope('everything', {
				characters: [],
				log: [],
				communities: [makeCommunity('x-1', 'Skara Brae'), makeCommunity('x-2', 'Westcliff')],
				npcs: [makeNpc('x-3', 'Old Vala'), makeNpc('x-4', 'Brokk the Smith')],
				places: [makePlace('x-5', 'The Silver Fish')],
				expeditions: [
					makeJourney('x-6', 'Road to the Black Spire'),
					makeSite('x-7', 'The Black Spire'),
				],
				foes: [],
				session: {},
			}),
		);

		const dialog = page.locator('.icd-dialog');
		await expect(dialog).toBeVisible({ timeout: 5_000 });

		// Five category groups — communities, NPCs, places, journeys, sites —
		// each rendered with the correct singular/plural label.
		await expect(dialog.locator('.icd-group-label')).toHaveText([
			'Communities',
			'NPCs',
			'Place',
			'Journey',
			'Site',
		]);
		await expect(
			dialog.locator('.icd-group').filter({ hasText: 'Communities' }).locator('.icd-name'),
		).toHaveText(['Skara Brae', 'Westcliff']);
		await expect(
			dialog.locator('.icd-group').filter({ hasText: 'NPCs' }).locator('.icd-name'),
		).toHaveText(['Old Vala', 'Brokk the Smith']);
		await expect(
			dialog.locator('.icd-group').filter({ hasText: 'Place' }).locator('.icd-name'),
		).toHaveText(['The Silver Fish']);
		await expect(
			dialog.locator('.icd-group').filter({ hasText: 'Journey' }).locator('.icd-name'),
		).toHaveText(['Road to the Black Spire']);
		await expect(
			dialog.locator('.icd-group').filter({ hasText: 'Site' }).locator('.icd-name'),
		).toHaveText(['The Black Spire']);

		// Default selection is 'new'. The RadioGroup was migrated to bits-ui
		// (`RadioGroup.Item` renders `<button role="radio" data-value="X"
		// data-state="checked|unchecked">`), so scope by data-value and read
		// data-state instead of the retired `<input name="strategy">`.
		await expect(dialog.locator('[role="radio"][data-value="new"]')).toHaveAttribute(
			'data-state',
			'checked',
		);

		await dialog.locator('button:has-text("Cancel import")').click();
		await expect(dialog).not.toBeVisible();
	});

	test('a legacy export with no `places` key loads without complaint', async ({ page }) => {
		// Simulates an older export made before Places existed.
		await importPayload(
			page,
			envelope('communities', {
				communities: [makeCommunity('c-1', 'Skara Brae')],
				npcs: [makeNpc('n-1', 'Old Vala')],
				// Deliberately NO `places` key.
			}),
		);
		await page.waitForTimeout(1_500);
		await expect(page.locator('.icd-dialog')).not.toBeVisible();
		const world = await readWorld(page);
		expect(world.communities).toHaveLength(1);
		expect(world.npcs).toHaveLength(1);
		expect(world.places).toHaveLength(0);
	});

	test('strategy "new" — both versions coexist, ids distinct', async ({ page }) => {
		// Original — 1 community, 1 NPC, fixed ids.
		await importPayload(
			page,
			envelope('communities', {
				communities: [makeCommunity('c-1', 'Skara Brae')],
				npcs: [makeNpc('n-1', 'Old Vala')],
			}),
		);
		await page.waitForTimeout(1_500);

		// Same NAMES, different ids (cross-user transfer).
		await importPayload(
			page,
			envelope('communities', {
				communities: [makeCommunity('x-1', 'Skara Brae', { trouble: 'Bandits' })],
				npcs: [makeNpc('x-2', 'Old Vala', { notes: 'mentor' })],
			}),
		);
		const dialog = page.locator('.icd-dialog');
		await expect(dialog).toBeVisible({ timeout: 5_000 });
		await dialog.locator('[role="radio"][data-value="new"]').click();
		await dialog.locator('button.btn-primary').click();
		await expect(dialog).not.toBeVisible();
		await page.waitForTimeout(1_800);

		const world = await readWorld(page);
		expect(world.communities).toHaveLength(2);
		expect(world.npcs).toHaveLength(2);
		expect(new Set(world.communities.map((c) => c.id)).size).toBe(2);
		expect(new Set(world.npcs.map((n) => n.id)).size).toBe(2);
		expect(world.communities.map((c) => c.name)).toEqual(['Skara Brae', 'Skara Brae']);
		expect(world.npcs.map((n) => n.name)).toEqual(['Old Vala', 'Old Vala']);
	});

	test('strategy "replace" — overwrites existing row; EXISTING id preserved', async ({ page }) => {
		await importPayload(
			page,
			envelope('communities', {
				communities: [makeCommunity('c-original', 'Skara Brae')],
				npcs: [],
			}),
		);
		await page.waitForTimeout(1_500);

		// Same name, different id, edited trouble (simulates exported copy
		// that was modified externally and brought back).
		await importPayload(
			page,
			envelope('communities', {
				communities: [makeCommunity('c-incoming', 'Skara Brae', { trouble: 'Bandits' })],
				npcs: [],
			}),
		);
		const dialog = page.locator('.icd-dialog');
		await expect(dialog).toBeVisible({ timeout: 5_000 });
		await dialog.locator('[role="radio"][data-value="replace"]').click();
		await dialog.locator('button.btn-primary').click();
		await expect(dialog).not.toBeVisible();
		await page.waitForTimeout(1_800);

		const world = await readWorld(page);
		expect(world.communities).toHaveLength(1);
		// The existing user's id wins (not the incoming row's id) — the row
		// is updated in place rather than re-keyed.
		expect(world.communities[0].id).toBe('c-original');
		expect(world.communities[0].name).toBe('Skara Brae');
		expect(world.communities[0].trouble).toBe('Bandits');
	});

	test('strategy "skip" — preserves existing; drops incoming colliding row', async ({ page }) => {
		await importPayload(
			page,
			envelope('communities', {
				communities: [makeCommunity('c-1', 'Skara Brae')],
				npcs: [makeNpc('n-1', 'Old Vala')],
			}),
		);
		await page.waitForTimeout(1_500);

		await importPayload(
			page,
			envelope('communities', {
				communities: [makeCommunity('x-1', 'Skara Brae', { trouble: 'Should not land' })],
				npcs: [makeNpc('x-2', 'Old Vala', { notes: 'Should not land' })],
			}),
		);
		const dialog = page.locator('.icd-dialog');
		await expect(dialog).toBeVisible({ timeout: 5_000 });
		await dialog.locator('[role="radio"][data-value="skip"]').click();
		await dialog.locator('button.btn-primary').click();
		await expect(dialog).not.toBeVisible();
		await page.waitForTimeout(1_800);

		const world = await readWorld(page);
		expect(world.communities).toHaveLength(1);
		expect(world.communities[0].name).toBe('Skara Brae');
		expect(world.communities[0].trouble).toBe('');
		expect(world.npcs).toHaveLength(1);
		expect(world.npcs[0].name).toBe('Old Vala');
	});

	test('"Cancel import" aborts the whole file — nothing is applied', async ({ page }) => {
		await importPayload(
			page,
			envelope('communities', {
				communities: [makeCommunity('c-1', 'Skara Brae')],
				npcs: [],
			}),
		);
		await page.waitForTimeout(1_500);
		const before = await readWorld(page);
		expect(before.communities).toHaveLength(1);

		await importPayload(
			page,
			envelope('communities', {
				communities: [
					makeCommunity('x-1', 'Skara Brae'),
					makeCommunity('x-2', 'Westcliff'), // would be a clean add
				],
				npcs: [makeNpc('x-3', 'Brokk the Smith')], // ditto
			}),
		);
		const dialog = page.locator('.icd-dialog');
		await expect(dialog).toBeVisible({ timeout: 5_000 });
		await dialog.locator('button:has-text("Cancel import")').click();
		await expect(dialog).not.toBeVisible();
		await page.waitForTimeout(800);

		const after = await readWorld(page);
		expect(after.communities).toHaveLength(1);
		expect(after.communities[0].name).toBe('Skara Brae');
		expect(after.npcs).toHaveLength(0);
	});

	test('non-colliding rows in the same file always import normally', async ({ page }) => {
		await importPayload(
			page,
			envelope('communities', {
				communities: [makeCommunity('c-1', 'Skara Brae')],
				npcs: [],
			}),
		);
		await page.waitForTimeout(1_500);

		// Second file: one collision (same name, different id) + one fresh.
		await importPayload(
			page,
			envelope('communities', {
				communities: [makeCommunity('x-1', 'Skara Brae'), makeCommunity('x-2', 'Brand New Hamlet')],
				npcs: [makeNpc('x-3', 'Newcomer')],
			}),
		);
		const dialog = page.locator('.icd-dialog');
		await expect(dialog).toBeVisible({ timeout: 5_000 });

		// Only the one colliding name is listed.
		await expect(dialog.locator('.icd-name')).toHaveText(['Skara Brae']);
		// NPCs section is hidden because nothing collides there.
		await expect(dialog.locator('.icd-group').filter({ hasText: 'NPC' })).toHaveCount(0);

		await dialog.locator('[role="radio"][data-value="skip"]').click();
		await dialog.locator('button.btn-primary').click();
		await page.waitForTimeout(1_800);

		const world = await readWorld(page);
		expect(world.communities.map((c) => c.name).sort()).toEqual(
			['Brand New Hamlet', 'Skara Brae'].sort(),
		);
		expect(world.npcs.map((n) => n.name)).toEqual(['Newcomer']);
	});

	test('singular labels — one colliding row uses "Community" not "Communities"', async ({
		page,
	}) => {
		await importPayload(
			page,
			envelope('communities', {
				communities: [makeCommunity('c-1', 'Skara Brae')],
				npcs: [],
			}),
		);
		await page.waitForTimeout(1_500);

		await importPayload(
			page,
			envelope('communities', {
				communities: [makeCommunity('x-1', 'Skara Brae')],
				npcs: [],
			}),
		);
		const dialog = page.locator('.icd-dialog');
		await expect(dialog).toBeVisible({ timeout: 5_000 });
		await expect(dialog.locator('.icd-group-label')).toHaveText(['Community']);
		await dialog.locator('button:has-text("Cancel import")').click();
	});

	test('case-insensitive name match — "Skara Brae" collides with "skara brae"', async ({
		page,
	}) => {
		await importPayload(
			page,
			envelope('communities', {
				communities: [makeCommunity('c-1', 'Skara Brae')],
				npcs: [],
			}),
		);
		await page.waitForTimeout(1_500);

		await importPayload(
			page,
			envelope('communities', {
				communities: [makeCommunity('x-1', '  skara brae  ')], // leading/trailing whitespace + lowercase
				npcs: [],
			}),
		);
		const dialog = page.locator('.icd-dialog');
		await expect(dialog).toBeVisible({ timeout: 5_000 });
		await expect(dialog.locator('.icd-name')).toHaveText(['  skara brae  ']);
		await dialog.locator('button:has-text("Cancel import")').click();
	});
});
