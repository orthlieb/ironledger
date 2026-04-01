import { defineConfig, devices } from '@playwright/test';

/**
 * Iron Ledger — Playwright E2E configuration.
 *
 * Assumes the dev server is already running on port 5173 and the API on 3000.
 * Run with: npx playwright test
 */
export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: false, // serial — tests share a logged-in session
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: 1,
	reporter: 'list',

	use: {
		baseURL: 'http://localhost:5173',
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
	},

	projects: [
		// Step 1: log in once and save the cookie
		{
			name: 'setup',
			testMatch: '**/auth.setup.ts',
		},
		// Step 2: all other tests use the saved auth state
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
				storageState: './tests/e2e/.auth/user.json',
			},
			dependencies: ['setup'],
		},
	],
});
