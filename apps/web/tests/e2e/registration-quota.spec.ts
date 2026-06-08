/**
 * registration-quota.spec.ts — Daily UTC registration quota.
 *
 * Three scenarios:
 *   1. Sufficient tokens — capped with headroom; register form shows,
 *      submit succeeds, user lands on /register/sent.
 *   2. Run out of tokens — capped at exactly usedToday (0 remaining);
 *      /register immediately shows the "Daily Signups Full" closed UI
 *      without the form, and the API rejects direct POSTs with 429.
 *   3. Unlimited — quota cleared; register form shows and submit
 *      succeeds regardless of prior usage.
 *
 * Setup/teardown via the admin API. Every test restores the quota to
 * unlimited in afterEach so the system is never left capped between runs.
 */
import { test, expect, request } from '@playwright/test';

const API = 'http://127.0.0.1:3000';

// ---------------------------------------------------------------------------
// Admin API helpers
// ---------------------------------------------------------------------------

async function adminToken(): Promise<string> {
	const ctx = await request.newContext({ baseURL: API });
	const res = await ctx.post('/api/v1/auth/login', {
		data: {
			email: 'admin@ironledger.local',
			password: 'adminpassword123!',
			captchaToken: 'dev-bypass',
		},
	});
	if (!res.ok()) throw new Error(`Admin login failed: ${res.status()} ${await res.text()}`);
	const body = (await res.json()) as { accessToken: string };
	await ctx.dispose();
	return body.accessToken;
}

interface QuotaStatus {
	daily: number | null;
	usedToday: number;
	remaining: number | null;
	resetsAt: string;
	exhausted: boolean;
}

async function getQuota(token: string): Promise<QuotaStatus> {
	const ctx = await request.newContext({ baseURL: API });
	const res = await ctx.get('/api/v1/admin/registration-quota/status', {
		headers: { Authorization: `Bearer ${token}` },
	});
	if (!res.ok()) throw new Error(`getQuota failed: ${res.status()} ${await res.text()}`);
	const body = (await res.json()) as QuotaStatus;
	await ctx.dispose();
	return body;
}

async function setQuota(token: string, daily: number | null): Promise<QuotaStatus> {
	const ctx = await request.newContext({ baseURL: API });
	const res = await ctx.put('/api/v1/admin/registration-quota', {
		headers: { Authorization: `Bearer ${token}` },
		data: { daily },
	});
	if (!res.ok()) throw new Error(`setQuota failed: ${res.status()} ${await res.text()}`);
	const body = (await res.json()) as QuotaStatus;
	await ctx.dispose();
	return body;
}

async function deleteUserByEmail(token: string, email: string): Promise<void> {
	const ctx = await request.newContext({ baseURL: API });
	try {
		const listRes = await ctx.get('/api/v1/admin/', {
			headers: { Authorization: `Bearer ${token}` },
		});
		if (!listRes.ok()) return;
		const users = (await listRes.json()) as Array<{ id: string; email: string }>;
		const target = users.find((u) => u.email === email.toLowerCase());
		if (target) {
			await ctx.delete(`/api/v1/admin/users/${target.id}`, {
				headers: { Authorization: `Bearer ${token}` },
			});
		}
	} finally {
		await ctx.dispose();
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Registration Daily Quota', () => {
	let token: string;

	test.beforeAll(async () => {
		token = await adminToken();
	});

	test.afterEach(async () => {
		// Always leave the system in "unlimited" — other tests (registration-lock,
		// admin-invite's happy path) would fail if we left a cap in place.
		await setQuota(token, null);
	});

	test('sufficient tokens: register form shows, signup succeeds', async ({ page }) => {
		// Cap well above current usage — we must still have room after this test.
		const current = await getQuota(token);
		await setQuota(token, current.usedToday + 10);

		const email = `e2e-quota-ok-${Date.now()}@ironledger.test`;
		const pw = `QuotaOkE2E-${Date.now()}!`;

		try {
			await page.context().clearCookies();
			await page.goto('/register');

			// Form visible (not the closed UI)
			await expect(page.locator('form[method="POST"]')).toBeVisible();
			await expect(page.locator('input[name="email"]')).toBeVisible();
			await expect(page.locator('.maintenance-title')).toHaveCount(0);

			// Submit
			await page.locator('input[name="email"]').fill(email);
			await page.locator('input[name="password"]').first().fill(pw);
			await page.locator('input[name="confirm"]').first().fill(pw);
			await Promise.all([
				page.waitForURL(/\/register\/sent/, { timeout: 15_000 }),
				page.locator('button[type="submit"]').click(),
			]);
			expect(page.url()).toContain('/register/sent');

			// Usage should have incremented by 1
			const after = await getQuota(token);
			expect(after.usedToday).toBe(current.usedToday + 1);
		} finally {
			await deleteUserByEmail(token, email);
		}
	});

	test('run out of tokens: closed UI shows on load, API rejects with 429', async ({ page }) => {
		// We want the quota in "exhausted" state (used >= cap) before navigating.
		// The setQuota API only accepts daily >= 1, so we can't simply set the
		// cap to 0 when usedToday is 0. Instead, raise the cap, consume a
		// registration via the public endpoint to bump usedToday >= 1, then
		// pin the cap to that count.
		let current = await getQuota(token);
		if (current.usedToday === 0) {
			await setQuota(token, 10);
			const bumpCtx = await request.newContext({ baseURL: API });
			await bumpCtx.post('/api/v1/auth/register', {
				data: {
					email: `e2e-quota-bump-${Date.now()}@ironledger.test`,
					password: `BumpE2E-${Date.now()}!`,
					captchaToken: 'dev-bypass',
				},
			});
			await bumpCtx.dispose();
			current = await getQuota(token);
		}

		// Pin the cap exactly at current usage → 0 remaining → exhausted.
		await setQuota(token, current.usedToday);

		// 1. /register page shows the closed UI before the user types anything
		await page.context().clearCookies();
		await page.goto('/register');

		await expect(page.locator('.maintenance-title')).toHaveText('Daily Signups Full');
		await expect(page.locator('.maintenance-message').first()).toContainText(/come back tomorrow/i);
		await expect(page.locator('form[method="POST"]')).toHaveCount(0);
		await expect(page.locator('input[name="email"]')).toHaveCount(0);

		// 2. API rejects direct POSTs too — belt-and-braces beyond the UI
		const ctx = await request.newContext({ baseURL: API });
		const postRes = await ctx.post('/api/v1/auth/register', {
			data: {
				email: `e2e-quota-blocked-${Date.now()}@ironledger.test`,
				password: `BlockedE2E-${Date.now()}!`,
				captchaToken: 'dev-bypass',
			},
		});
		expect(postRes.status()).toBe(429);
		const body = (await postRes.json()) as { message?: string };
		await ctx.dispose();
		expect(body.message).toMatch(/signups are full|come back tomorrow/i);
	});

	test('unlimited: register form shows and signup succeeds with no cap', async ({ page }) => {
		await setQuota(token, null);

		const status = await getQuota(token);
		expect(status.daily).toBeNull();
		expect(status.exhausted).toBe(false);

		const email = `e2e-quota-unlimited-${Date.now()}@ironledger.test`;
		const pw = `UnlimitedE2E-${Date.now()}!`;

		try {
			await page.context().clearCookies();
			await page.goto('/register');

			await expect(page.locator('form[method="POST"]')).toBeVisible();
			await expect(page.locator('.maintenance-title')).toHaveCount(0);

			await page.locator('input[name="email"]').fill(email);
			await page.locator('input[name="password"]').first().fill(pw);
			await page.locator('input[name="confirm"]').first().fill(pw);
			await Promise.all([
				page.waitForURL(/\/register\/sent/, { timeout: 15_000 }),
				page.locator('button[type="submit"]').click(),
			]);
			expect(page.url()).toContain('/register/sent');
		} finally {
			await deleteUserByEmail(token, email);
		}
	});
});
