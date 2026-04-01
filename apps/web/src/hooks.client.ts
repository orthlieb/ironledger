import { appendLog, enrichOutcomeLinks, SESSION_LOG_ID } from '$lib/log.svelte.js';

// Expose log helpers on window for Playwright E2E tests (DEV mode only).
if (import.meta.env.DEV) {
	(window as any).__testLog = { appendLog, enrichOutcomeLinks, SESSION_LOG_ID };
}
