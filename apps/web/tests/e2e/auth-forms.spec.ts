/**
 * auth-forms.spec.ts — what you type on a sign-in page before it has
 * finished loading is kept.
 *
 * The log-in, register, forgot-password and new-link pages are server-
 * rendered forms that take typing before their scripts arrive. Loading them
 * (hydration) used to set each field back to what the server rendered (empty,
 * or the address it was handed), wiping an address typed or autofilled on a
 * slow connection; the emptied required field then stopped the form sending,
 * with no word why.
 */
import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * Open `url` with its scripts held back, so it stays the server's HTML until
 * the returned function lets them through and waits for the page to hydrate.
 */
async function openBeforeScripts(page: Page, url: string): Promise<() => Promise<void>> {
	const held: Route[] = [];
	let holding = true;
	await page.route('**/*', (route) => {
		if (holding && route.request().resourceType() === 'script') held.push(route);
		else void route.continue();
	});
	await page.goto(url, { waitUntil: 'commit' });
	return async () => {
		holding = false;
		await Promise.all(held.splice(0).map((r) => r.continue()));
		// The root layout marks <html data-view> on mount, which comes after
		// the whole page has hydrated; the server never sets it.
		await page.locator('html[data-view]').waitFor({ state: 'attached', timeout: 20_000 });
		await page.unroute('**/*');
	};
}

const PAGES: { name: string; url: string; fields: Record<string, string> }[] = [
	{
		name: 'log in',
		url: '/login',
		fields: { email: 'early-login@ironledger.test', password: 'typed-before-load' },
	},
	{
		name: 'register',
		url: '/register',
		fields: {
			email: 'early-register@ironledger.test',
			displayName: 'Early Bird',
			password: 'typed-before-load',
			confirm: 'typed-before-load',
		},
	},
	{
		name: 'forgot password',
		url: '/forgot-password',
		fields: { email: 'early-forgot@ironledger.test' },
	},
	{
		// Arrives with the address from the log-in page; a corrected one stays.
		name: 'send a new link',
		url: '/resend-verification?email=given%40ironledger.test',
		fields: { email: 'corrected@ironledger.test' },
	},
];

test.describe('Typing before a sign-in page has loaded', () => {
	// Signed out: a signed-in visit to /login goes straight to /home.
	test.use({ storageState: { cookies: [], origins: [] } });

	for (const { name, url, fields } of PAGES) {
		test(`${name}: the typing is kept`, async ({ page }) => {
			const release = await openBeforeScripts(page, url);
			for (const [field, value] of Object.entries(fields))
				await page.locator(`input[name="${field}"]`).fill(value);

			await release();

			for (const [field, value] of Object.entries(fields))
				await expect(page.locator(`input[name="${field}"]`)).toHaveValue(value);
		});
	}
});
