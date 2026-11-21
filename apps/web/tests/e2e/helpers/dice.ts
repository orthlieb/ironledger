/**
 * Loaded dice for E2E tests. `rollDie` (#lib/dice.ts) draws one Uint32 per die
 * from crypto.getRandomValues, so the faces queued here come up in order;
 * once the queue is empty the dice are fair again.
 */
import type { Page } from '@playwright/test';

/** Load the dice, before the page loads. */
export async function loadDice(page: Page) {
	await page.addInitScript(() => {
		const queue: number[] = [];
		(window as unknown as { __dice: number[] }).__dice = queue;
		const real = crypto.getRandomValues.bind(crypto);
		crypto.getRandomValues = ((arr: Uint32Array) => {
			if (queue.length && arr instanceof Uint32Array && arr.length === 1) {
				arr[0] = queue.shift() ?? 0;
				return arr;
			}
			return real(arr);
		}) as typeof crypto.getRandomValues;
	});
}

/** Queue the faces the next dice come up: an action roll's action die, then
 *  its two challenge dice; a progress roll's two challenge dice. */
export async function queueDice(page: Page, faces: number[]) {
	await page.evaluate(
		(f) => (window as unknown as { __dice: number[] }).__dice.push(...f.map((x) => x - 1)),
		faces,
	);
}
