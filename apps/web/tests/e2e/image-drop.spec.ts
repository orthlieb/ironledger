/**
 * image-drop.spec.ts — an image dragged in from the desktop and dropped on
 * an image uploader uploads, the same as choosing it in the file picker
 * (use:dropImage, #lib/actions/dropImage.ts).
 *
 *   • Portrait (the character's Background tab; the same component serves
 *     NPCs, settlements and expeditions): a non-image file isn't taken; an
 *     image dropped on the empty portrait uploads and is saved; a second
 *     image dropped on it replaces it.
 *   • Map: an image dropped on an empty map becomes its background.
 *   • A file dropped where nothing takes it does nothing (the browser would
 *     otherwise open it in place of the app).
 *
 * Playwright can't drag a file from the desktop, so each test builds a
 * DataTransfer holding a File in the page and dispatches the drag events a
 * browser sends.
 */
import { test, expect, type Locator, type JSHandle, type Page } from '@playwright/test';
import { resetAll, seedCharacter } from './helpers/reset';
import { settleHome } from './helpers/home';

const CHAR_AREA = '.home-area--characters';

type DropFile = { name: string; type: string; color?: string };

/** A DataTransfer holding one file: a PNG filled with `color`, or a text file. */
function fileTransfer(page: Page, file: DropFile): Promise<JSHandle<DataTransfer>> {
	return page.evaluateHandle(async ({ name, type, color }) => {
		let blob: Blob;
		if (color) {
			const canvas = document.createElement('canvas');
			canvas.width = canvas.height = 16;
			const g = canvas.getContext('2d')!;
			g.fillStyle = color;
			g.fillRect(0, 0, 16, 16);
			blob = await new Promise<Blob>((done) => canvas.toBlob((b) => done(b!), 'image/png'));
		} else {
			blob = new Blob(['not an image'], { type });
		}
		const dt = new DataTransfer();
		dt.items.add(new File([blob], name, { type }));
		return dt;
	}, file);
}

/** Drag `file` in over `target` (enter + over); returns the transfer to drop. */
async function dragIn(target: Locator, file: DropFile): Promise<JSHandle<DataTransfer>> {
	const dataTransfer = await fileTransfer(target.page(), file);
	await target.dispatchEvent('dragenter', { dataTransfer });
	await target.dispatchEvent('dragover', { dataTransfer });
	return dataTransfer;
}

const isPortraitPut = (url: string, method: string) =>
	method === 'PUT' && url.includes('/portrait');

test.describe('Dropping an image on an uploader', () => {
	test.beforeAll(async () => {
		await resetAll();
		await seedCharacter('Drop Tester');
	});

	test.beforeEach(async ({ page }) => {
		await page.goto('/home');
		await settleHome(page);
	});

	test('a portrait takes a dropped image, keeps it, and a second one replaces it', async ({
		page,
	}) => {
		await page.locator(`${CHAR_AREA} .ca-tab`, { hasText: /^Background$/i }).click();
		const portrait = page.locator(`${CHAR_AREA} .pu-wrap`);
		await expect(portrait.locator('.pu-img--placeholder')).toBeVisible({ timeout: 8_000 });

		let puts = 0;
		page.on('request', (r) => {
			if (isPortraitPut(r.url(), r.method())) puts++;
		});

		// A text file: no highlight, and dropping it uploads nothing.
		let dataTransfer = await dragIn(portrait, { name: 'notes.txt', type: 'text/plain' });
		await expect(portrait).not.toHaveAttribute('data-drop-over');
		await portrait.dispatchEvent('drop', { dataTransfer });
		await expect(portrait.locator('.pu-img--placeholder')).toBeVisible();
		expect(puts).toBe(0);

		// An image: highlighted while over it, uploaded when dropped.
		dataTransfer = await dragIn(portrait, { name: 'red.png', type: 'image/png', color: '#c00' });
		await expect(portrait).toHaveAttribute('data-drop-over', '');
		let saved = page.waitForResponse((r) => isPortraitPut(r.url(), r.request().method()));
		await portrait.dispatchEvent('drop', { dataTransfer });
		await expect(portrait).not.toHaveAttribute('data-drop-over');
		expect((await saved).ok()).toBe(true);
		const img = portrait.locator('img.pu-img');
		await expect(img).toBeVisible();
		const first = await img.getAttribute('src');
		expect(first).toMatch(/^data:image\//);

		// A second image dropped on the filled portrait replaces it.
		dataTransfer = await dragIn(portrait, { name: 'blue.png', type: 'image/png', color: '#00c' });
		await expect(portrait).toHaveAttribute('data-drop-over', '');
		saved = page.waitForResponse((r) => isPortraitPut(r.url(), r.request().method()));
		await portrait.dispatchEvent('drop', { dataTransfer });
		expect((await saved).ok()).toBe(true);
		await expect.poll(() => img.getAttribute('src')).not.toBe(first);

		// Saved: after a reload the portrait comes from the server.
		await page.reload();
		await settleHome(page);
		await page.locator(`${CHAR_AREA} .ca-tab`, { hasText: /^Background$/i }).click();
		await expect(page.locator(`${CHAR_AREA} .pu-wrap img.pu-img`)).toHaveAttribute(
			'src',
			/\/portrait\?v=/,
		);
	});

	test('the map takes a dropped image as its background', async ({ page }) => {
		await page.locator('[aria-label="Open the campaign map"]').first().click();
		await expect(page.locator('.mp-dialog')).toBeVisible({ timeout: 15_000 });
		await expect(page.locator('.mp-empty-cta')).toBeVisible({ timeout: 8_000 });

		const map = page.locator('.mp-body');
		await expect(map).toHaveAttribute('data-drop-label', 'Drop to set the background');
		const dataTransfer = await dragIn(map, { name: 'map.png', type: 'image/png', color: '#2a6' });
		await expect(map).toHaveAttribute('data-drop-over', '');
		await map.dispatchEvent('drop', { dataTransfer });

		await expect(page.locator('.mp-empty-cta')).toBeHidden({ timeout: 8_000 });
		await expect(page.locator('.mp-grid-capture')).toBeVisible();
		await expect(map).not.toHaveAttribute('data-drop-over');
		await expect(map).toHaveAttribute('data-drop-label', 'Drop to replace the background');
	});

	test('a file dropped where nothing takes it does nothing', async ({ page }) => {
		const prevented = await page.evaluate(() => {
			const dataTransfer = new DataTransfer();
			dataTransfer.items.add(new File(['x'], 'stray.png', { type: 'image/png' }));
			const init = { bubbles: true, cancelable: true, dataTransfer };
			const over = new DragEvent('dragover', init);
			const drop = new DragEvent('drop', init);
			document.body.dispatchEvent(over);
			document.body.dispatchEvent(drop);
			return [over.defaultPrevented, drop.defaultPrevented];
		});
		// Prevented = the browser's own handling (opening the file) is off.
		expect(prevented).toEqual([true, true]);
	});
});
