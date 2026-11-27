/**
 * admin-page.spec.ts — the /admin dashboard as an admin sees it.
 *
 * Signs in as the seeded admin and works on a throwaway account made for
 * the run, so no seeded user is touched:
 *   - Users tab: suspend asks first (Cancel changes nothing), suspends and
 *     unsuspends, and Delete removes the account once confirmed.
 *   - Every tab fills the page's width (the page used to shrink to its
 *     content, narrowing on Logs and Tools), and a new log length fetches
 *     the log once, not twice.
 *   - A phone gets one card per user and per invitation instead of the
 *     tables (an invitation is sent and revoked from its card), and no tab
 *     scrolls sideways.
 */
import { test, expect, type Page } from '@playwright/test';
import { adminToken, createVerifiedUser, deleteUserByEmail } from './helpers/admin';

const ADMIN_EMAIL = 'admin@ironledger.local';
const ADMIN_PASSWORD = 'adminpassword123!';

async function signInAsAdmin(page: Page): Promise<void> {
	await page.goto('/login');
	await page.locator('input[name="email"]').fill(ADMIN_EMAIL);
	await page.locator('input[name="password"]').fill(ADMIN_PASSWORD);
	await page.getByRole('button', { name: 'Sign In' }).click();
	await page.waitForURL((u) => !u.pathname.startsWith('/login'));
	await page.goto('/admin');
	await expect(page.getByRole('tab', { name: 'Users' })).toBeVisible({ timeout: 15_000 });
}

const confirmDialog = (page: Page) => page.getByRole('alertdialog');

test.describe('Admin dashboard', () => {
	test.use({ storageState: { cookies: [], origins: [] } });

	const email = `e2e-admin-page-${Date.now()}@ironledger.test`;
	const password = `AdminPageE2E-${Date.now()}!x`;
	let token: string;

	test.beforeAll(async () => {
		token = await adminToken();
		await createVerifiedUser(token, email, password);
	});

	test.afterAll(async () => {
		await deleteUserByEmail(token, email);
	});

	test('Users tab: suspend asks first, then suspends, unsuspends and deletes', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await signInAsAdmin(page);

		const row = page.locator('.admin-table tbody tr', { hasText: email });
		await expect(row).toBeVisible();

		// Cancel leaves the account as it was.
		await row.getByRole('button', { name: 'Suspend' }).click();
		await expect(confirmDialog(page)).toContainText('Suspend User');
		await expect(confirmDialog(page)).toContainText(email);
		await confirmDialog(page).getByRole('button', { name: 'Cancel' }).click();
		await expect(confirmDialog(page)).toHaveCount(0);
		await expect(row.getByRole('button', { name: 'Suspend' })).toBeVisible();

		await row.getByRole('button', { name: 'Suspend' }).click();
		await confirmDialog(page).getByRole('button', { name: 'Suspend' }).click();
		await expect(row.getByRole('button', { name: 'Unsuspend' })).toBeVisible();

		await row.getByRole('button', { name: 'Unsuspend' }).click();
		await expect(confirmDialog(page)).toContainText('Unsuspend User');
		await confirmDialog(page).getByRole('button', { name: 'Unsuspend' }).click();
		await expect(row.getByRole('button', { name: 'Suspend' })).toBeVisible();

		await row.getByRole('button', { name: 'Delete' }).click();
		await expect(confirmDialog(page)).toContainText('Delete User');
		await confirmDialog(page).getByRole('button', { name: 'Delete' }).click();
		await expect(row).toHaveCount(0);
	});

	test('every tab fills the page; a new log length fetches once', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await signInAsAdmin(page);

		const pageWidth = () =>
			page.locator('.admin-page').evaluate((el) => Math.round(el.getBoundingClientRect().width));
		const usersWidth = await pageWidth();

		await page.getByRole('tab', { name: 'Tools' }).click();
		await expect(page.getByText('Maintenance Mode', { exact: true })).toBeVisible();
		expect(await pageWidth()).toBe(usersWidth);

		const firstLoad = page.waitForResponse((r) => r.url().includes('/api/admin/logs?'));
		await page.getByRole('tab', { name: 'Logs' }).click();
		await firstLoad;
		expect(await pageWidth()).toBe(usersWidth);

		let fetches = 0;
		page.on('request', (r) => {
			if (r.url().includes('/api/admin/logs?')) fetches++;
		});
		const reload = page.waitForResponse((r) => r.url().includes('lines=500'));
		await page.getByRole('button', { name: '500 lines' }).click();
		await reload;
		// Room for a second, duplicate request to show up if there were one.
		await page.waitForTimeout(500);
		expect(fetches).toBe(1);
	});

	test('a phone gets cards, not tables, and no tab scrolls sideways', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await signInAsAdmin(page);

		const sideways = () =>
			page.locator('main.app-main').evaluate((el) => el.scrollWidth - el.clientWidth);

		await expect(page.locator('.admin-table-wrap')).toBeHidden();
		const card = page.locator('.user-card', { hasText: ADMIN_EMAIL });
		await expect(card).toBeVisible();
		await expect(card.getByRole('button', { name: 'Delete' })).toBeVisible();
		expect(await sideways()).toBeLessThanOrEqual(0);

		// Send an invitation from the phone: it lists as a card, the sent-link
		// box fits, and Revoke works from the card.
		const invitee = `e2e-admin-phone-${Date.now()}@ironledger.test`;
		await page.getByRole('tab', { name: 'Invites' }).click();
		await page.getByPlaceholder('Where the invite is sent').fill(invitee);
		await page.getByRole('button', { name: 'Send invite' }).click();
		const invite = page.locator('.invite-card', { hasText: invitee });
		await expect(invite).toContainText('pending');
		await expect(page.locator('.invites-table')).toBeHidden();
		expect(await sideways()).toBeLessThanOrEqual(0);
		// Revoking expires the link (inviteService: the recipient sees "expired").
		await invite.getByRole('button', { name: 'Revoke' }).click();
		await expect(invite).toContainText('expired');
		await expect(invite.getByRole('button', { name: 'Revoke' })).toHaveCount(0);

		for (const tab of ['Logs', 'Tools']) {
			await page.getByRole('tab', { name: tab }).click();
			await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('data-state', 'active');
			expect(await sideways(), `${tab} scrolls sideways`).toBeLessThanOrEqual(0);
		}
	});
});
