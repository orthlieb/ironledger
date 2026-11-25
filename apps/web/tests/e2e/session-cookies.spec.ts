/**
 * session-cookies.spec.ts — the sign-in cookies behave.
 *
 *   • Several requests at once with an expired access token share one
 *     refresh. Each used to refresh with the same `rt`; the first rotated it
 *     and the rest presented a revoked token, which the API treats as theft,
 *     revoking the session: the player was signed out.
 *   • Without "Remember me" the refresh token stays a session cookie after a
 *     refresh (it used to become a 30-day one).
 *   • Logging out revokes the refresh token on the server, not just in the
 *     browser (the API never saw it before).
 *
 * Uses its own account: logging out and forcing refreshes would disturb the
 * shared dev session the other specs sign in with.
 */
import { test, expect, request, type Page, type BrowserContext } from '@playwright/test';
import { API, adminToken, createVerifiedUser, deleteUserByEmail } from './helpers/admin';

async function signIn(page: Page, email: string, password: string, remember = false) {
	await page.goto('/login');
	if (remember) {
		// A click before the page hydrates does nothing, so tick the box,
		// retrying until it sticks.
		const box = page.getByRole('checkbox', { name: 'Remember me' });
		await expect(async () => {
			if (!(await box.isChecked())) await box.click();
			await expect(box).toBeChecked({ timeout: 500 });
		}).toPass({ timeout: 10_000 });
	}
	await page.locator('input[name="email"]').fill(email);
	await page.locator('input[name="password"]').fill(password);
	await page.getByRole('button', { name: 'Sign In' }).click();
	await page.waitForURL(/\/home/, { timeout: 15_000 });
}

/** Swap the access token for a garbled one, so the next request must refresh. */
async function expireAccessToken(context: BrowserContext) {
	const cookies = await context.cookies();
	const at = cookies.find((c) => c.name === 'access_token');
	if (!at) throw new Error('no access_token cookie');
	await context.addCookies([{ ...at, value: 'expired.expired.expired' }]);
}

test.describe('Sign-in cookies', () => {
	test.use({ storageState: { cookies: [], origins: [] } });

	const email = `e2e-session-${Date.now()}@ironledger.test`;
	const password = `SessionE2E-${Date.now()}!x`;
	let token: string;

	test.beforeAll(async () => {
		token = await adminToken();
		await createVerifiedUser(token, email, password);
	});

	test.afterAll(async () => {
		await deleteUserByEmail(token, email);
	});

	test('parallel requests after the access token expires keep the session', async ({
		page,
		context,
	}) => {
		await signIn(page, email, password);
		await expireAccessToken(context);

		const statuses = await page.evaluate(async () => {
			const urls = Array.from({ length: 6 }, () => '/api/session/extensions');
			return Promise.all(urls.map(async (u) => (await fetch(u)).status));
		});
		expect(statuses).toEqual([200, 200, 200, 200, 200, 200]);

		// Still signed in afterwards: the session wasn't revoked as "stolen".
		const after = await page.evaluate(async () => (await fetch('/api/session/extensions')).status);
		expect(after).toBe(200);
	});

	test('without "Remember me" the refresh token stays a session cookie', async ({
		page,
		context,
	}) => {
		await signIn(page, email, password);
		await expireAccessToken(context);
		await page.evaluate(async () => (await fetch('/api/session/extensions')).status);
		const rt = (await context.cookies()).find((c) => c.name === 'rt');
		expect(rt?.expires).toBe(-1);
	});

	test('with "Remember me" it stays a 30-day cookie', async ({ page, context }) => {
		await signIn(page, email, password, true);
		const before = (await context.cookies()).find((c) => c.name === 'rt');
		expect(before?.expires ?? 0).toBeGreaterThan(Date.now() / 1000 + 29 * 24 * 3600);
		await expireAccessToken(context);
		await page.evaluate(async () => (await fetch('/api/session/extensions')).status);
		const rt = (await context.cookies()).find((c) => c.name === 'rt');
		expect(rt?.expires ?? 0).toBeGreaterThan(Date.now() / 1000 + 29 * 24 * 3600);
	});

	test('logging out revokes the refresh token on the server', async ({ page, context }) => {
		await signIn(page, email, password);
		const rt = (await context.cookies()).find((c) => c.name === 'rt')?.value;
		expect(rt).toBeTruthy();

		// The ☰ menu's Sign out submits this form (POST /logout).
		await page.locator('form.hm-logout-form').evaluate((f: HTMLFormElement) => f.submit());
		await page.waitForURL(/\/login/);

		const api = await request.newContext({ baseURL: API });
		const res = await api.post('/api/v1/auth/refresh', { headers: { Cookie: `rt=${rt}` } });
		expect(res.status()).toBe(401);
		await api.dispose();
	});
});
