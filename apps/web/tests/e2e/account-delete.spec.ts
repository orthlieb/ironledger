/**
 * account-delete.spec.ts — a player deletes their own account, and the
 * privacy notice that says what's kept.
 *
 * ☰ → Settings → Account → Delete my account asks for the password again.
 * A wrong one keeps the account and says so in place; the right one deletes
 * it, signs the browser out and lands on the log-in page, where the account
 * no longer works. The API's own tests cover the data going with it.
 */
import { test, expect, type Page } from '@playwright/test';
import { adminToken, createVerifiedUser, deleteUserByEmail } from './helpers/admin';

async function signIn(page: Page, email: string, password: string): Promise<void> {
	await page.goto('/login');
	await page.locator('input[name="email"]').fill(email);
	await page.locator('input[name="password"]').fill(password);
	await page.getByRole('button', { name: 'Sign In' }).click();
}

test.describe('Delete my account', () => {
	test.use({ storageState: { cookies: [], origins: [] } });

	const email = `e2e-delete-${Date.now()}@ironledger.test`;
	const password = `DeleteMeE2E-${Date.now()}!x`;
	let token: string;

	test.beforeAll(async () => {
		token = await adminToken();
		await createVerifiedUser(token, email, password);
	});

	test.afterAll(async () => {
		await deleteUserByEmail(token, email); // only if the test failed part-way
	});

	test('asks for the password, refuses a wrong one, then deletes the account', async ({ page }) => {
		await signIn(page, email, password);
		await page.waitForURL(/\/home/, { timeout: 15_000 });

		// A click before the page has hydrated does nothing; retry until the menu opens.
		await expect(async () => {
			await page.locator('.hamburger-btn').click();
			await expect(page.locator('.hm-menu')).toBeVisible({ timeout: 1_000 });
		}).toPass({ timeout: 10_000 });
		await page.locator('.hm-item', { hasText: /settings/i }).click();
		await page.locator('.sd-tab', { hasText: /^Account$/ }).click();
		await expect(page.getByRole('link', { name: 'privacy notice' })).toHaveAttribute(
			'href',
			'/privacy',
		);
		await page.getByTestId('delete-account').click();

		const confirm = page.getByRole('alertdialog', { name: 'Delete your account?' });
		const field = page.getByTestId('delete-account-password');
		const go = confirm.getByRole('button', { name: 'Delete Forever' });
		await expect(field).toBeFocused();
		await expect(go).toBeDisabled();

		await field.fill('not-the-password');
		await go.click();
		await expect(page.getByTestId('delete-account-error')).toHaveText("That password isn't right.");
		await expect(field).toHaveValue('not-the-password');

		await field.fill(password);
		await go.click();
		await page.waitForURL(/\/login\?deleted=1/, { timeout: 15_000 });
		await expect(page.getByTestId('account-deleted')).toBeVisible();

		// Signed out, and the account is gone.
		await page.goto('/home');
		await expect(page).toHaveURL(/\/login/);
		await signIn(page, email, password);
		await expect(page.locator('.error-msg')).toHaveText('Invalid email or password.');
	});
});

test.describe('Privacy notice', () => {
	test.use({ storageState: { cookies: [], origins: [] } });

	test('is public, and linked from the log-in and register pages', async ({ page }) => {
		await page.goto('/login');
		await page.getByRole('link', { name: 'Privacy' }).click();
		await expect(page).toHaveURL(/\/privacy$/);
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		await expect(page.getByText('deleted after 90 days')).toBeVisible();

		await page.goto('/register');
		await expect(page.getByTestId('register-privacy')).toHaveAttribute('href', '/privacy');
	});
});
