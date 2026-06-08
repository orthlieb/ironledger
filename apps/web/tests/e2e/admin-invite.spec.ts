/**
 * admin-invite.spec.ts — Admin Invite feature end-to-end.
 *
 * Verifies the invitation flow from both ends:
 *   1. Happy path — admin creates an invite, recipient visits the URL,
 *      sees the register-hero card, sets a password, lands signed-in on /home.
 *   2. Expired / revoked link — recipient visits a non-working URL and sees
 *      the expired-hero card with an error message and no accept form.
 *   3. Invalid token — same expired-hero UI for a token the server has never
 *      heard of. Exercises the same error code-path from the /login shortcut.
 *
 * Admin setup/teardown goes through the API directly. The recipient flow
 * runs in the browser with cookies cleared so we're a fresh, logged-out
 * visitor (the default storageState is signed in as the dev user).
 */
import { test, expect, request } from '@playwright/test';

const API = 'http://127.0.0.1:3000';

// ---------------------------------------------------------------------------
// Admin API helpers
// ---------------------------------------------------------------------------

/** Get an admin access token via the API. */
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

/** Create an invite. Returns the invite row + the raw-token URL. */
async function createInvite(
	token: string,
	email: string,
	displayName?: string,
): Promise<{ invite: { id: string; email: string }; url: string }> {
	const ctx = await request.newContext({ baseURL: API });
	const res = await ctx.post('/api/v1/admin/invites', {
		headers: { Authorization: `Bearer ${token}` },
		data: { email, ...(displayName ? { displayName } : {}) },
	});
	const body = await res.json();
	await ctx.dispose();
	if (!res.ok()) throw new Error(`Create invite failed: ${res.status()} ${JSON.stringify(body)}`);
	return body as { invite: { id: string; email: string }; url: string };
}

/** Revoke an invite. Idempotent. */
async function revokeInvite(token: string, inviteId: string): Promise<void> {
	const ctx = await request.newContext({ baseURL: API });
	const res = await ctx.delete(`/api/v1/admin/invites/${inviteId}`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	await ctx.dispose();
	if (!res.ok()) throw new Error(`Revoke failed: ${res.status()} ${await res.text()}`);
}

/** Delete a user by email so the happy-path test doesn't leak state. */
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

/** Pull the raw token out of an invite URL so tests don't depend on APP_URL. */
function tokenFromUrl(url: string): string {
	const m = url.match(/\/invite\/([^/?#]+)/);
	if (!m) throw new Error(`Could not extract token from URL: ${url}`);
	return m[1];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Admin Invite', () => {
	let token: string;

	test.beforeAll(async () => {
		token = await adminToken();
	});

	test('happy path: admin creates invite, recipient accepts and lands on /home', async ({
		page,
	}) => {
		const email = `e2e-invite-${Date.now()}@ironledger.test`;
		const { url } = await createInvite(token, email, 'E2E Invitee');

		try {
			// Recipient is a logged-out visitor — wipe the dev-user storage state.
			await page.context().clearCookies();
			await page.goto(`/invite/${tokenFromUrl(url)}`);

			// Register hero image + form, prefilled display name.
			await expect(page.locator('.hero-image[src*="ironledger-register"]')).toBeVisible();
			await expect(page.locator('.invite-intro')).toContainText(email);
			await expect(page.locator('input[name="displayName"]')).toHaveValue('E2E Invitee');

			// Password must survive HIBP — use a unique string generated per run.
			const pw = `InviteAcceptE2E-${Date.now()}!`;
			await page.locator('input[name="password"]').first().fill(pw);
			await page.locator('input[name="confirm"]').first().fill(pw);

			// Submit and follow the redirect.
			await Promise.all([
				page.waitForURL(/\/home(?:$|[?#])/, { timeout: 15_000 }),
				page.locator('button[type="submit"]').click(),
			]);

			expect(page.url()).toContain('/home');
		} finally {
			// Clean up: remove the account created by the invite so re-runs don't
			// collide with "email already registered" on create-invite.
			await deleteUserByEmail(token, email);
		}
	});

	test('expired link: revoked invite shows the expired hero and error, no form', async ({
		page,
	}) => {
		const email = `e2e-invite-expired-${Date.now()}@ironledger.test`;
		const { invite, url } = await createInvite(token, email);

		// Revoke immediately. The UI does not distinguish revoked / expired /
		// already-used — all three hit the same error render path with the
		// expired hero image, which is what users actually see.
		await revokeInvite(token, invite.id);

		await page.context().clearCookies();
		await page.goto(`/invite/${tokenFromUrl(url)}`);

		// Expired hero image + caption + error message.
		await expect(page.locator('.hero-image[src*="ironledger-email-expired"]')).toBeVisible();
		await expect(page.locator('.hero-caption')).toHaveText('The summons has passed its hour.');
		await expect(page.locator('.error-msg')).toBeVisible();

		// No accept form.
		await expect(page.locator('input[name="password"]')).toHaveCount(0);

		// A link back to /login is offered as an escape hatch.
		await expect(page.locator('a[href="/login"]')).toBeVisible();
	});

	test('invalid token: unknown token shows the expired hero', async ({ page }) => {
		// 64-hex random-looking token the server has never issued.
		const fakeToken = '0000000000000000000000000000000000000000000000000000000000000000';

		await page.context().clearCookies();
		await page.goto(`/invite/${fakeToken}`);

		await expect(page.locator('.hero-image[src*="ironledger-email-expired"]')).toBeVisible();
		await expect(page.locator('.error-msg')).toBeVisible();
		await expect(page.locator('input[name="password"]')).toHaveCount(0);
	});
});
