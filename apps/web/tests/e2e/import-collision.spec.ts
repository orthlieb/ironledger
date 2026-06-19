/**
 * import-collision.spec.ts — ImportCollisionDialog (PR #40).
 *
 * When an import file contains NPC/community/expedition ids that already
 * exist in the active session, a dialog opens offering four outcomes:
 *
 *   • 'new'     — regenerate the incoming id; both versions coexist
 *   • 'replace' — overwrite the existing row; id preserved
 *   • 'skip'    — drop the colliding incoming row; existing untouched
 *   • 'cancel'  — abort the whole import; nothing applied
 *
 * Plus the dialog must list each colliding row *by name*, grouped by
 * category, and must not appear at all when the file has no collisions.
 */
import { test, expect, type Page } from '@playwright/test';
import { resetAll } from './helpers/reset';

// ── Test fixtures ────────────────────────────────────────────────────────────

/** Bare-bones Community row missing only `id` and `name`. */
function makeCommunity(id: string, name: string) {
	return {
		id,
		name,
		region: '',
		location: '',
		locationDescription: '',
		trouble: '',
		notes: '',
	};
}

/** Bare-bones NPC row. */
function makeNpc(id: string, name: string) {
	return {
		id,
		name,
		role: '',
		goal: '',
		descriptor: '',
		relationship: 'friendly' as const,
		location: '',
		notes: '',
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

/** Wrap a payload in the manifest envelope the importer expects. */
function envelope(type: string, data: unknown) {
	return {
		manifest: {
			app: 'Iron Ledger',
			version: '1.0.0',
			exportedAt: new Date().toISOString(),
			type,
			count: 0,
		},
		data,
	};
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

/** Push a payload through the import file input. Skips the Hamburger →
 *  Import → confirm-modal flow because that's covered by import-export.spec.ts;
 *  here we want to exercise the collision dialog itself. */
async function importPayload(page: Page, payload: unknown) {
	await page.locator('input[type="file"][accept=".json,application/json"]').setInputFiles({
		name: 'test.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify(payload)),
	});
}

/** Read current Communities / NPCs / Expeditions through the SvelteKit BFF. */
async function readWorld(page: Page) {
	return await page.evaluate(async () => {
		const res = await fetch('/api/session', { credentials: 'include' });
		const j = (await res.json()) as {
			communities?: Array<{ id: string; name: string }>;
			npcs?: Array<{ id: string; name: string }>;
			expeditions?: Array<{ id: string; name: string }>;
		};
		return {
			communities: j.communities ?? [],
			npcs: j.npcs ?? [],
			expeditions: j.expeditions ?? [],
		};
	});
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Import collision dialog', () => {
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
		// The dialog must not appear; the rows should just import.
		await page.waitForTimeout(1_500);
		await expect(page.locator('dialog.icd-dialog[open]')).not.toBeVisible();
		const world = await readWorld(page);
		expect(world.communities).toHaveLength(1);
		expect(world.npcs).toHaveLength(1);
	});

	test('opens and lists colliding rows by name, grouped by category', async ({ page }) => {
		// First import — establishes the rows.
		await importPayload(
			page,
			envelope('everything', {
				characters: [],
				log: [],
				communities: [makeCommunity('c-1', 'Skara Brae'), makeCommunity('c-2', 'Westcliff')],
				npcs: [makeNpc('n-1', 'Old Vala'), makeNpc('n-2', 'Brokk the Smith')],
				expeditions: [
					makeJourney('j-1', 'Road to the Black Spire'),
					makeSite('s-1', 'The Black Spire'),
				],
				foes: [],
				session: {},
			}),
		);
		await page.waitForTimeout(1_800);

		// Second import of the same payload — collision dialog should open
		// and list each colliding row by name.
		await importPayload(
			page,
			envelope('everything', {
				characters: [],
				log: [],
				communities: [makeCommunity('c-1', 'Skara Brae'), makeCommunity('c-2', 'Westcliff')],
				npcs: [makeNpc('n-1', 'Old Vala'), makeNpc('n-2', 'Brokk the Smith')],
				expeditions: [
					makeJourney('j-1', 'Road to the Black Spire'),
					makeSite('s-1', 'The Black Spire'),
				],
				foes: [],
				session: {},
			}),
		);

		const dialog = page.locator('dialog.icd-dialog[open]');
		await expect(dialog).toBeVisible({ timeout: 5_000 });

		// Three category groups, plural labels because each has >1 row.
		await expect(dialog.locator('.icd-group-label')).toHaveText([
			'Communities',
			'NPCs',
			'Expeditions',
		]);
		await expect(
			dialog.locator('.icd-group').filter({ hasText: 'Communities' }).locator('.icd-name'),
		).toHaveText(['Skara Brae', 'Westcliff']);
		await expect(
			dialog.locator('.icd-group').filter({ hasText: 'NPCs' }).locator('.icd-name'),
		).toHaveText(['Old Vala', 'Brokk the Smith']);
		await expect(
			dialog.locator('.icd-group').filter({ hasText: 'Expeditions' }).locator('.icd-name'),
		).toHaveText(['Road to the Black Spire', 'The Black Spire']);

		// Default selection is 'new'.
		await expect(dialog.locator('input[name="strategy"][value="new"]')).toBeChecked();

		// Cancel without applying so we leave a clean state for the next test.
		await dialog.locator('button:has-text("Cancel import")').click();
		await expect(dialog).not.toBeVisible();
	});

	test('strategy "new" — regenerates ids; both versions coexist', async ({ page }) => {
		const original = envelope('communities', {
			communities: [makeCommunity('c-1', 'Skara Brae')],
			npcs: [makeNpc('n-1', 'Old Vala')],
		});
		const edited = envelope('communities', {
			communities: [makeCommunity('c-1', 'Skara Brae (edited)')],
			npcs: [makeNpc('n-1', 'Old Vala (edited)')],
		});

		await importPayload(page, original);
		await page.waitForTimeout(1_500);

		await importPayload(page, edited);
		const dialog = page.locator('dialog.icd-dialog[open]');
		await expect(dialog).toBeVisible({ timeout: 5_000 });
		await dialog.locator('input[name="strategy"][value="new"]').check();
		await dialog.locator('button.btn-primary').click();
		await expect(dialog).not.toBeVisible();
		await page.waitForTimeout(1_800);

		const world = await readWorld(page);
		expect(world.communities).toHaveLength(2);
		expect(world.npcs).toHaveLength(2);
		// All ids distinct.
		expect(new Set(world.communities.map((c) => c.id)).size).toBe(2);
		expect(new Set(world.npcs.map((n) => n.id)).size).toBe(2);
		// Both names present.
		expect(world.communities.map((c) => c.name).sort()).toEqual(
			['Skara Brae', 'Skara Brae (edited)'].sort(),
		);
		expect(world.npcs.map((n) => n.name).sort()).toEqual(['Old Vala', 'Old Vala (edited)'].sort());
	});

	test('strategy "replace" — overwrites existing row; id preserved', async ({ page }) => {
		const original = envelope('communities', {
			communities: [makeCommunity('c-1', 'Skara Brae')],
			npcs: [],
		});
		const edited = envelope('communities', {
			communities: [{ ...makeCommunity('c-1', 'Skara Brae (edited)'), trouble: 'Bandits' }],
			npcs: [],
		});

		await importPayload(page, original);
		await page.waitForTimeout(1_500);

		await importPayload(page, edited);
		const dialog = page.locator('dialog.icd-dialog[open]');
		await expect(dialog).toBeVisible({ timeout: 5_000 });
		await dialog.locator('input[name="strategy"][value="replace"]').check();
		await dialog.locator('button.btn-primary').click();
		await expect(dialog).not.toBeVisible();
		await page.waitForTimeout(1_800);

		const world = await readWorld(page);
		expect(world.communities).toHaveLength(1);
		// Original id is preserved, content is the edited version.
		expect(world.communities[0].id).toBe('c-1');
		expect(world.communities[0].name).toBe('Skara Brae (edited)');
		// Other fields were also overwritten.
		expect((world.communities[0] as { trouble?: string }).trouble).toBe('Bandits');
	});

	test('strategy "skip" — preserves existing; drops incoming colliding row', async ({ page }) => {
		const original = envelope('communities', {
			communities: [makeCommunity('c-1', 'Skara Brae')],
			npcs: [makeNpc('n-1', 'Old Vala')],
		});
		const edited = envelope('communities', {
			communities: [makeCommunity('c-1', 'Skara Brae (edited)')],
			npcs: [makeNpc('n-1', 'Old Vala (edited)')],
		});

		await importPayload(page, original);
		await page.waitForTimeout(1_500);

		await importPayload(page, edited);
		const dialog = page.locator('dialog.icd-dialog[open]');
		await expect(dialog).toBeVisible({ timeout: 5_000 });
		await dialog.locator('input[name="strategy"][value="skip"]').check();
		await dialog.locator('button.btn-primary').click();
		await expect(dialog).not.toBeVisible();
		await page.waitForTimeout(1_800);

		const world = await readWorld(page);
		expect(world.communities).toHaveLength(1);
		expect(world.communities[0].name).toBe('Skara Brae');
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
					makeCommunity('c-1', 'Skara Brae (edited)'),
					makeCommunity('c-new', 'Westcliff'), // would normally be a clean add
				],
				npcs: [makeNpc('n-new', 'Brokk the Smith')], // ditto
			}),
		);
		const dialog = page.locator('dialog.icd-dialog[open]');
		await expect(dialog).toBeVisible({ timeout: 5_000 });
		await dialog.locator('button:has-text("Cancel import")').click();
		await expect(dialog).not.toBeVisible();
		await page.waitForTimeout(800);

		// Nothing changed — not even the non-colliding rows.
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

		// Second file: one collision, one fresh.
		await importPayload(
			page,
			envelope('communities', {
				communities: [
					makeCommunity('c-1', 'Skara Brae (edited)'),
					makeCommunity('c-new', 'Brand New Hamlet'),
				],
				npcs: [makeNpc('n-new', 'Newcomer')],
			}),
		);
		const dialog = page.locator('dialog.icd-dialog[open]');
		await expect(dialog).toBeVisible({ timeout: 5_000 });

		// Dialog should only list the one colliding community — the incoming
		// edited name, not "Brand New Hamlet" (no collision) or the existing
		// "Skara Brae" (the dialog reports what's in the file).
		await expect(dialog.locator('.icd-name')).toHaveText(['Skara Brae (edited)']);
		// NPCs section is hidden because nothing collides there.
		await expect(dialog.locator('.icd-group').filter({ hasText: 'NPCs' })).toHaveCount(0);

		await dialog.locator('input[name="strategy"][value="skip"]').check();
		await dialog.locator('button.btn-primary').click();
		await page.waitForTimeout(1_800);

		const world = await readWorld(page);
		// Skip dropped 'Skara Brae (edited)' but 'Brand New Hamlet' and 'Newcomer'
		// must still have come in normally.
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
				communities: [makeCommunity('c-1', 'Skara Brae')],
				npcs: [],
			}),
		);
		const dialog = page.locator('dialog.icd-dialog[open]');
		await expect(dialog).toBeVisible({ timeout: 5_000 });
		await expect(dialog.locator('.icd-group-label')).toHaveText(['Community']);
		await dialog.locator('button:has-text("Cancel import")').click();
	});
});
