/**
 * helpers/saves.ts — wait for an autosave to reach the server.
 *
 * The v2 areas autosave through a 1.5 s trailing debounce, and the entity
 * sync queues an edit made while an earlier save is still in flight behind
 * it as a second request. So a fixed sleep, or `networkidle` (which can
 * settle inside the debounce gap), can't tell when the edit a test cares
 * about has landed. On a loaded CI runner the save is often still pending
 * when the test reloads, and the edit is gone.
 *
 * Instead, wait for the save whose request body carries the value: once the
 * server has acknowledged it, a reload must show it. Start the wait BEFORE
 * the edit that triggers the save:
 *
 *   const saved = waitForSave(page, '/api/characters/', noteText);
 *   await textarea.fill(noteText);
 *   await textarea.blur();
 *   await saved;
 *   await page.reload();
 */
import type { Page, Response } from '@playwright/test';

const SAVE_METHODS = new Set(['POST', 'PUT', 'PATCH']);

/**
 * Resolve with the first successful POST/PUT/PATCH to a URL containing `path`
 * whose request body contains every string in `values`. Values are matched
 * against the raw JSON body, so keep them plain text (no quotes or
 * backslashes, which JSON escapes).
 */
export function waitForSave(page: Page, path: string, ...values: string[]): Promise<Response> {
	return page.waitForResponse(
		(r) => {
			const req = r.request();
			if (!SAVE_METHODS.has(req.method()) || !r.url().includes(path) || !r.ok()) return false;
			const body = req.postData() ?? '';
			return values.every((v) => body.includes(v));
		},
		// The debounce is 1.5 s; the rest is headroom for a slow CI box.
		{ timeout: 15_000 },
	);
}
