/**
 * verification-resend.spec.ts — a lost verification email isn't the end.
 *
 * The link in the verification email works for 24 hours, and a new one can
 * be asked for at /resend-verification. The way there:
 *   • logging in before verifying names the problem and links to it, with
 *     the address filled in;
 *   • the "check your email" page after registering links to it;
 *   • a dead or expired verification link links to it.
 *
 * The emails themselves can't be read here (the API's own tests cover the
 * new link replacing the old one); this covers the pages and their wiring.
 */
import { test, expect } from '@playwright/test';
import { adminToken, deleteUserByEmail, registerUnverified } from './helpers/admin';

test.describe('A lost verification email', () => {
	// Signed out: these are the pages a new player sees.
	test.use({ storageState: { cookies: [], origins: [] } });

	const email = `e2e-resend-${Date.now()}@ironledger.test`;
	const password = `ResendE2E-${Date.now()}!x`;
	let token: string;

	test.beforeAll(async () => {
		token = await adminToken();
		await registerUnverified(email, password);
	});

	test.afterAll(async () => {
		await deleteUserByEmail(token, email);
	});

	test('logging in unverified offers a new link, with the address filled in', async ({ page }) => {
		await page.goto('/login');
		await page.locator('input[name="email"]').fill(email);
		await page.locator('input[name="password"]').fill(password);
		await page.getByRole('button', { name: 'Sign In' }).click();

		await expect(page.locator('.error-msg')).toContainText('Verify your email address first');
		await page.getByTestId('login-resend-link').click();

		await expect(page).toHaveURL(/\/resend-verification\?email=/);
		await expect(page.locator('input[name="email"]')).toHaveValue(email);
		await page.getByRole('button', { name: 'Send a New Link' }).click();
		await expect(page.getByTestId('resend-sent')).toContainText(email);
	});

	test('an address with no account gets the same answer', async ({ page }) => {
		await page.goto('/resend-verification');
		await page.locator('input[name="email"]').fill('nobody-here@ironledger.test');
		await page.getByRole('button', { name: 'Send a New Link' }).click();
		await expect(page.getByTestId('resend-sent')).toContainText('nobody-here@ironledger.test');
	});

	test('the check-your-email page and a dead link both lead there', async ({ page }) => {
		await page.goto('/register/sent');
		await expect(page.getByRole('link', { name: 'Send a new link' })).toHaveAttribute(
			'href',
			'/resend-verification',
		);

		// Opening the link changes nothing (mail scanners fetch links); the
		// button posts the token.
		await page.goto('/verify-email?token=not-a-real-token');
		await page.getByRole('button', { name: 'Verify My Email' }).click();
		await expect(page.locator('.error-msg')).toBeVisible();
		await page.getByRole('link', { name: 'Send a new link' }).click();
		await expect(page).toHaveURL(/\/resend-verification$/);
	});
});
