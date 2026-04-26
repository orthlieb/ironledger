/**
 * registration-lock.spec.ts — Registration Lock admin feature.
 *
 * Verifies that an admin can lock new user registration and that a
 * logged-out visitor then sees the "registration closed" message on
 * /register instead of the sign-up form.
 *
 * Uses the admin API directly (no browser login needed for setup/teardown)
 * and clears cookies on the page context to simulate a logged-out visitor.
 */
import { test, expect, request } from '@playwright/test';

const API = 'http://127.0.0.1:3000';
const LOCK_MESSAGE = 'E2E test: registration is temporarily closed.';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get an admin access token via the API. */
async function adminToken(): Promise<string> {
	const ctx = await request.newContext({ baseURL: API });
	const res = await ctx.post('/api/v1/auth/login', {
		data: {
			email:        'admin@ironledger.local',
			password:     'adminpassword123!',
			captchaToken: 'dev-bypass',
		},
	});
	if (!res.ok()) throw new Error(`Admin login failed: ${res.status()} ${await res.text()}`);
	const body = await res.json() as { accessToken: string };
	await ctx.dispose();
	return body.accessToken;
}

/** Lock registration via the admin API. */
async function lockRegistration(token: string, message: string) {
	const ctx = await request.newContext({ baseURL: API });
	const res = await ctx.post('/api/v1/admin/registration-lock', {
		headers: { Authorization: `Bearer ${token}` },
		data: { message },
	});
	await ctx.dispose();
	if (!res.ok()) throw new Error(`Lock failed: ${res.status()} ${await res.text()}`);
}

/** Unlock registration via the admin API. */
async function unlockRegistration(token: string) {
	const ctx = await request.newContext({ baseURL: API });
	const res = await ctx.delete('/api/v1/admin/registration-lock', {
		headers: { Authorization: `Bearer ${token}` },
	});
	await ctx.dispose();
	// 404 = already unlocked — that's fine during cleanup
	if (!res.ok() && res.status() !== 404) {
		throw new Error(`Unlock failed: ${res.status()} ${await res.text()}`);
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Registration Lock', () => {
	let token: string;

	test.beforeAll(async () => {
		token = await adminToken();
	});

	test.afterEach(async () => {
		// Always unlock after each test so we don't leave the system in a locked state.
		await unlockRegistration(token);
	});

	test('register page shows sign-up form when registration is open', async ({ page }) => {
		// Clear auth cookies so we're visiting as a logged-out user.
		await page.context().clearCookies();
		await page.goto('/register');

		await expect(page.locator('form')).toBeVisible();
		await expect(page.locator('input[name="email"]')).toBeVisible();
	});

	test('register page shows closed message when registration is locked', async ({ page }) => {
		await lockRegistration(token, LOCK_MESSAGE);

		await page.context().clearCookies();
		await page.goto('/register');

		// The sign-up form should NOT be present.
		await expect(page.locator('input[name="email"]')).not.toBeVisible();

		// "Registration Closed" heading and the custom lock message should appear.
		await expect(page.locator('.maintenance-title')).toHaveText('Registration Closed');
		await expect(page.locator('.maintenance-message').first()).toHaveText(LOCK_MESSAGE);

		// A link back to the login page should be offered.
		await expect(page.locator('.maintenance-body a[href="/login"]')).toBeVisible();
	});

	test('register page shows sign-up form again after unlock', async ({ page }) => {
		await lockRegistration(token, LOCK_MESSAGE);
		await unlockRegistration(token);

		await page.context().clearCookies();
		await page.goto('/register');

		await expect(page.locator('form')).toBeVisible();
		await expect(page.locator('input[name="email"]')).toBeVisible();
	});

	test('API rejects registration when locked', async () => {
		await lockRegistration(token, LOCK_MESSAGE);

		const ctx = await request.newContext({ baseURL: API });
		const res = await ctx.post('/api/v1/auth/register', {
			data: {
				email:        'newuser_locked_test@ironledger.local',
				password:     'somepassword123!',
				captchaToken: 'dev-bypass',
			},
		});
		expect(res.status()).toBe(403);
		const body = await res.json() as { message?: string };
		await ctx.dispose();
		expect(body.message).toContain(LOCK_MESSAGE);
	});
});
