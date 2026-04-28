/**
 * auth.setup.ts — runs once before all tests.
 * Logs in as the dev user via direct API call, saves the browser storage
 * state so every subsequent test starts already authenticated.
 */
import { test as setup, request } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const AUTH_FILE = path.join(import.meta.dirname, '.auth/user.json');

setup('authenticate as dev user', async ({ page }) => {
	// Call the API directly to get an access token (avoids Svelte form hydration issues)
	const apiCtx = await request.newContext({ baseURL: 'http://127.0.0.1:3000' });
	const res = await apiCtx.post('/api/v1/auth/login', {
		data: {
			email:        'test@ironledger.local',
			password:     'IronLedgerTest2024!',
			captchaToken: 'dev-bypass',
		},
	});

	if (!res.ok()) {
		throw new Error(`Login failed: ${res.status()} ${await res.text()}`);
	}

	const body = await res.json() as { accessToken: string };
	await apiCtx.dispose();

	// Inject the access_token cookie into the browser context, then navigate to /home
	await page.context().addCookies([
		{
			name:     'access_token',
			value:    body.accessToken,
			domain:   'localhost',
			path:     '/',
			httpOnly: true,
			sameSite: 'Strict',
			secure:   false,
		},
	]);

	// Navigate to /home to verify auth works and let SvelteKit populate localStorage
	await page.goto('/home');
	await page.waitForURL(/\/home/, { timeout: 10000 });

	// Force the 3D dice animation OFF for every test that inherits this storage
	// state. The library's WebGL physics + audio preload pipeline is the single
	// largest source of flakes in CI — chromium-headless audio can stall the
	// async init for several seconds, and the resulting timing variance trips
	// any test that does `await animateDice(...)` with a tight timeout. With
	// dice3d=off, animateDice() early-returns instantly and the log entry is
	// appended synchronously after the roll, which is what the assertions
	// actually care about. Same reasoning for dice sound: not under test.
	await page.evaluate(() => {
		localStorage.setItem('ironledger:dice3d',     'off');
		localStorage.setItem('ironledger:dice:sound', 'off');
	});

	// Save the authenticated state (cookies + localStorage)
	fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
	await page.context().storageState({ path: AUTH_FILE });
});
