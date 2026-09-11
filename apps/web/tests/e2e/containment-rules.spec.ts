/**
 * containment-rules.spec.ts — the "Within / Located In" containment rules.
 *
 * The forest obeys two rules the model enforces (see entityContainment.ts and
 * docs/communities.md):
 *   • containers are settlements/landmarks; NPCs are leaves;
 *   • at most ONE settlement per root-to-leaf path — a settlement may not sit,
 *     directly OR transitively, inside another settlement.
 *
 * Both must hold at the two places a link can be created: the Within picker in
 * the UI (it must only OFFER eligible parents) and import (it must REPAIR an
 * incoming file that describes an illegal nesting rather than create it).
 */
import { test, expect, type Page } from '@playwright/test';
import { zipSync, strToU8 } from 'fflate';
import { getTestToken, resetAll } from './helpers/reset';

const API = 'http://127.0.0.1:3000/api/v1';
const CM_AREA = '.home-area--communities';
const CM_COMBOBOX = `${CM_AREA} .cm-header .cm-hdr-combobox`;

// ── Import plumbing (mirrors import-collision.spec.ts) ─────────────────────────

/** Pack a `{ communities, places, npcs }` body into the `.zip` the importer
 *  accepts (top-level manifest + body file). */
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

async function importCommunities(page: Page, data: unknown) {
	await page.locator('input[type="file"][accept=".zip,application/zip"]').setInputFiles({
		name: 'test.zip',
		mimeType: 'application/zip',
		buffer: zipEnvelope('communities', data),
	});
}

type Row = { id: string; name: string; within?: string; withinRef?: unknown };
async function readWorld(page: Page): Promise<{ communities: Row[]; places: Row[]; npcs: Row[] }> {
	return await page.evaluate(async () => {
		const res = await fetch('/api/session', { credentials: 'include' });
		const j = (await res.json()) as { communities?: unknown; places?: unknown; npcs?: unknown };
		return {
			communities: (j.communities ?? []) as never[],
			places: (j.places ?? []) as never[],
			npcs: (j.npcs ?? []) as never[],
		};
	});
}

async function gotoHome(page: Page) {
	await page.goto('/home');
	await expect(page.locator(`${CM_AREA} .cm-loading`)).not.toBeVisible({ timeout: 12_000 });
	await page
		.locator(`${CM_AREA} .cm-empty, ${CM_AREA} .cm-body`)
		.first()
		.waitFor({ timeout: 12_000, state: 'attached' });
	await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
}

// ── API seeding with explicit `within` links ───────────────────────────────────

function community(id: string, name: string, within?: string): Row {
	return {
		id,
		name,
		within,
		region: '',
		location: '',
		locationDescription: '',
		trouble: '',
		notes: '',
		createdAt: Date.now(),
	} as Row;
}
function place(id: string, name: string, within?: string): Row {
	return {
		id,
		name,
		within,
		region: '',
		location: '',
		locationDescription: '',
		trouble: '',
		notes: '',
		createdAt: Date.now(),
	} as Row;
}

/** Replace the communities + places collections in one shot (via the API). */
async function seedForest(communities: Row[], places: Row[]) {
	const tok = await getTestToken();
	const headers = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };
	await fetch(`${API}/session/communities`, {
		method: 'PATCH',
		headers,
		body: JSON.stringify({ communities }),
	});
	await fetch(`${API}/session/places`, {
		method: 'PATCH',
		headers,
		body: JSON.stringify({ places }),
	});
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Containment rules', () => {
	test.beforeEach(async () => {
		await resetAll();
	});

	test('import: a settlement nested directly in a settlement lands top-level', async ({ page }) => {
		await gotoHome(page);
		// Bravo carries a withinRef pointing at settlement Alpha — illegal.
		await importCommunities(page, {
			communities: [
				{ ...community('c-alpha', 'Alpha Town'), id: 'c-alpha' },
				{
					...community('c-bravo', 'Bravo Town'),
					id: 'c-bravo',
					withinRef: { kind: 'community', name: 'Alpha Town' },
				},
			],
			places: [],
			npcs: [],
		});
		// Wait until relink has run (it strips the transport field), then assert
		// Bravo was NOT nested — the illegal link is dropped, Bravo stays a root.
		await expect
			.poll(
				async () => {
					const bravo = (await readWorld(page)).communities.find((c) => c.name === 'Bravo Town');
					return bravo
						? { present: true, within: bravo.within ?? null, hasRef: 'withinRef' in bravo }
						: null;
				},
				{ timeout: 12_000 },
			)
			.toEqual({ present: true, within: null, hasRef: false });
	});

	test('import: the deeper settlement on a two-settlement chain is detached', async ({ page }) => {
		await gotoHome(page);
		// Alpha(settlement) ← Vale(landmark) ← Bravo(settlement). Vale-in-Alpha is
		// legal; Bravo-in-Vale would put two settlements on one chain.
		await importCommunities(page, {
			communities: [
				{ ...community('c-alpha', 'Alpha Town'), id: 'c-alpha' },
				{
					...community('c-bravo', 'Bravo Town'),
					id: 'c-bravo',
					withinRef: { kind: 'place', name: 'Long Vale' },
				},
			],
			places: [
				{
					...place('p-vale', 'Long Vale'),
					id: 'p-vale',
					withinRef: { kind: 'community', name: 'Alpha Town' },
				},
			],
			npcs: [],
		});
		await expect
			.poll(
				async () => {
					const w = await readWorld(page);
					const vale = w.places.find((p) => p.name === 'Long Vale');
					const bravo = w.communities.find((c) => c.name === 'Bravo Town');
					const alpha = w.communities.find((c) => c.name === 'Alpha Town');
					if (!vale || !bravo || !alpha) return null;
					return {
						valeWithinAlpha: vale.within === `community:${alpha.id}`, // legal link kept
						bravoDetached: !bravo.within, // illegal link dropped
						transportStripped: !('withinRef' in vale) && !('withinRef' in bravo),
					};
				},
				{ timeout: 12_000 },
			)
			.toEqual({ valeWithinAlpha: true, bravoDetached: true, transportStripped: true });
	});

	test('UI: the Within picker offers only settlement-free landmark chains', async ({ page }) => {
		// Alpha(settlement) ← Low Vale(landmark).  Bravo(settlement) + Mesa Ridge
		// (landmark) are roots. Opening Bravo's Within picker must offer only Mesa
		// Ridge: Alpha is a settlement, and Low Vale already sits under a settlement.
		await seedForest(
			[community('c-alpha', 'Alpha Town'), community('c-bravo', 'Bravo Town')],
			[place('p-low', 'Low Vale', 'community:c-alpha'), place('p-mesa', 'Mesa Ridge')],
		);
		await gotoHome(page);

		// Switch the active connection to Bravo.
		await page.locator(CM_COMBOBOX).click();
		await page
			.locator('.cb-popover .cb-item:not(.cb-item--action)', { hasText: 'Bravo Town' })
			.click();
		await expect(page.locator('.cb-popover'))
			.toBeHidden({ timeout: 3_000 })
			.catch(() => {});

		// Open Bravo's Within picker and read the offered option names.
		await page.locator(`${CM_AREA} .cm-within-select`).click();
		const popover = page.locator('.cb-popover').last();
		await expect(popover).toBeVisible({ timeout: 3_000 });
		const names = await popover.locator('.cb-item-name').allInnerTexts();

		expect(names).toContain('Mesa Ridge'); // settlement-free landmark → eligible
		expect(names).not.toContain('Alpha Town'); // settlement → never a parent
		expect(names).not.toContain('Low Vale'); // landmark under a settlement → chain full
	});
});
