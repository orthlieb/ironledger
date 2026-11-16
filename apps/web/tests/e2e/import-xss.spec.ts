/**
 * import-xss.spec.ts — a hostile backup file runs nothing.
 *
 * Backups get shared online, so an imported one is untrusted. This one
 * carries script payloads where the app used to let them through:
 *   • a character stat that's markup, not a number (the Moves dialog's roll
 *     line was built from it and rendered as HTML);
 *   • raw markup in a log entry's HTML (now DOMPurify-cleaned on import);
 *   • an escaped payload as a log link's text, which marking the link spent
 *     used to write back unescaped, and which the Markdown export then parsed
 *     with innerHTML on a page element (that runs <img onerror>).
 * Each payload would add its number to window.__xss.
 */
import { test, expect, type Page } from '@playwright/test';
import { zipSync, strToU8 } from 'fflate';
import { resetAll } from './helpers/reset';

const ZIP_INPUT = 'input[type="file"][data-import-root="home"]';
const hook = (n: number) => `window.__xss=(window.__xss||[]).concat(${n})`;
const RAW = (n: number) => `<img src=x onerror="${hook(n)}">`;
// "&#111;nerror": the "o" as an entity, so a filter looking for "onerror=" in
// the HTML misses it, while the link's text decodes to a working handler.
const ESCAPED = (n: number) => `&lt;img src=x &#111;nerror="${hook(n)}"&gt;`;

function backup(data: unknown): Buffer {
	const manifest = { app: 'Iron Ledger', version: '1.0.0', type: 'everything', count: 0 };
	return Buffer.from(
		zipSync({
			'manifest.json': strToU8(JSON.stringify(manifest)),
			'everything.json': strToU8(JSON.stringify(data)),
		}),
	);
}

const ran = (page: Page) =>
	page.evaluate(() => (window as unknown as { __xss?: number[] }).__xss ?? []);

test.describe('A hostile backup', () => {
	test.beforeEach(async () => {
		await resetAll();
	});

	test('runs nothing: a stat, log HTML, a spent link, the Moves dialog, the Markdown export', async ({
		page,
	}) => {
		const entryId = crypto.randomUUID();
		const data = {
			characters: [
				{
					name: 'Brennan',
					data: { name: 'Brennan', edge: RAW(1), heart: 2, iron: 2, shadow: 1, wits: 1 },
				},
			],
			log: [
				{
					id: entryId,
					title: 'Hostile',
					ts: new Date().toISOString(),
					html:
						`<p>${RAW(2)}</p>` +
						`<a class="resource-link" data-resource="momentum" data-value="1" ` +
						`data-entry-id="${entryId}" href="#">${ESCAPED(3)}</a>`,
				},
			],
			encounters: [],
			session: {},
		};

		await page.goto('/home');
		await page.waitForLoadState('networkidle').catch(() => {});
		await page.locator(ZIP_INPUT).setInputFiles({
			name: 'hostile.zip',
			mimeType: 'application/zip',
			buffer: backup(data),
		});
		await expect(page.locator('.imd-badge--ok, .imd-badge--warn')).toBeVisible({
			timeout: 15_000,
		});
		await page.keyboard.press('Escape');

		// The stat arrived as a number, and the Moves roll line shows it as one.
		await expect(page.locator('.home-area--characters')).toContainText('Brennan', {
			timeout: 10_000,
		});
		await page.locator('.app-nav .act-btn', { hasText: 'Move' }).first().click();
		await page
			.locator('.moves-dialog .md-tile', {
				has: page.locator('.md-tile-name', { hasText: /^Face Danger$/ }),
			})
			.first()
			.click();
		await expect(page.locator('.moves-dialog')).toContainText('edge[0]', { timeout: 5_000 });
		await page.keyboard.press('Escape');

		// Spending the link writes its text back escaped.
		const link = page.locator('.log-entry a.resource-link').first();
		await expect(link).toBeVisible({ timeout: 10_000 });
		await link.click();
		await expect
			.poll(
				async () => {
					const log = await page.evaluate(async () => (await fetch('/api/session/log')).json());
					const entries = (Array.isArray(log) ? log : log.entries) as Array<{
						id: string;
						html: string;
					}>;
					return entries.find((e) => e.id === entryId)?.html ?? '';
				},
				{ timeout: 10_000 },
			)
			.toContain('resource-spent');
		const stored = await page.evaluate(async (id) => {
			const log = await (await fetch('/api/session/log')).json();
			const entries = (Array.isArray(log) ? log : log.entries) as Array<{
				id: string;
				html: string;
			}>;
			return entries.find((e) => e.id === id)?.html ?? '';
		}, entryId);
		expect(stored).not.toContain('<img');

		// The Markdown export reads every log entry's HTML.
		await page.locator('.hamburger-btn').click();
		await page.locator('.hm-item', { hasText: /Export/ }).click();
		await page.locator('.exd-segbtn', { hasText: 'Markdown' }).click();
		await Promise.all([
			page.waitForEvent('download'),
			page.locator('.exd-dialog .btn-primary').click(),
		]);

		// Image errors fire asynchronously: give them a moment.
		await page.waitForTimeout(1_000);
		expect(await ran(page)).toEqual([]);
	});
});
