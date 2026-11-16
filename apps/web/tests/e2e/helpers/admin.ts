/**
 * Admin API helpers for specs that create and remove accounts.
 *
 * Talk to Fastify directly, as the seeded admin. The dev captcha bypass
 * applies outside production.
 */
import { request } from '@playwright/test';

export const API = 'http://127.0.0.1:3000';

/** An access token for the seeded admin account. */
export async function adminToken(): Promise<string> {
	const ctx = await request.newContext({ baseURL: API });
	try {
		const res = await ctx.post('/api/v1/auth/login', {
			data: {
				email: 'admin@ironledger.local',
				password: 'adminpassword123!',
				captchaToken: 'dev-bypass',
			},
		});
		if (!res.ok()) throw new Error(`Admin login failed: ${res.status()} ${await res.text()}`);
		return ((await res.json()) as { accessToken: string }).accessToken;
	} finally {
		await ctx.dispose();
	}
}

/** Delete the account with this email, if there is one. */
export async function deleteUserByEmail(token: string, email: string): Promise<void> {
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

/** Register an account through the API; it stays unverified. */
export async function registerUnverified(email: string, password: string): Promise<void> {
	const ctx = await request.newContext({ baseURL: API });
	try {
		const res = await ctx.post('/api/v1/auth/register', {
			data: { email, password, captchaToken: 'dev-bypass' },
		});
		if (res.status() !== 202) throw new Error(`Register failed: ${res.status()}`);
	} finally {
		await ctx.dispose();
	}
}
