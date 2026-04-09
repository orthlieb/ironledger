/**
 * navigation.spec.ts — top-level nav and tab switching.
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.goto('/home');
	// Wait for DB session to finish loading before clicking tabs
	await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 8000 });
});

test('page loads and shows all four tabs', async ({ page }) => {
	for (const tab of ['characters', 'foes', 'expeditions', 'adventure']) {
		await expect(page.locator(`.tab-btn[data-tab="${tab}"]`)).toBeVisible();
	}
});

test('characters tab switches on click', async ({ page }) => {
	await page.click('.tab-btn[data-tab="characters"]');
	await expect(page.locator('.tab-btn[data-tab="characters"]')).toHaveClass(/active/);
});

test('foes tab switches on click and shows toolbar', async ({ page }) => {
	await page.click('.tab-btn[data-tab="foes"]');
	await expect(page.locator('.tab-btn[data-tab="foes"]')).toHaveClass(/active/);
	await expect(page.locator('.char-toolbar').first()).toBeVisible();
});

test('expeditions tab switches on click and shows toolbar', async ({ page }) => {
	await page.click('.tab-btn[data-tab="expeditions"]');
	await expect(page.locator('.tab-btn[data-tab="expeditions"]')).toHaveClass(/active/);
	// Wait for expeditions-specific toolbar content
	await expect(page.locator('.char-toolbar button:has-text("+ Journey")')).toBeVisible({ timeout: 5000 });
});

test('adventure tab switches on click and shows GCB and log', async ({ page }) => {
	await page.click('.tab-btn[data-tab="adventure"]');
	await expect(page.locator('.tab-btn[data-tab="adventure"]')).toHaveClass(/active/);
	await expect(page.locator('.adventure-gcb')).toBeVisible({ timeout: 3000 });
	await expect(page.locator('.adventure-log')).toBeVisible({ timeout: 3000 });
});

test('settings button opens settings dialog', async ({ page }) => {
	await page.click('.hamburger-btn');
	await page.click('.menu-item:has-text("Settings")');
	await expect(page.locator('.settings-dialog')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.locator('.settings-dialog')).not.toBeVisible();
});
