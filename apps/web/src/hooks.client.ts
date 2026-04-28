import { appendLog, enrichOutcomeLinks, SESSION_LOG_ID } from '$lib/log.svelte.js';

// Expose log helpers on window so Playwright E2E tests can inject mock log
// entries against the production build (vite preview), not just dev mode.
// Not security-sensitive — these are the same functions any user action can
// invoke through the UI; exposing them on window just removes the click
// path. If we later want to restrict to CI, gate on a SvelteKit env flag
// rather than `import.meta.env.DEV` (which is hard-false after `vite build`).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__testLog = { appendLog, enrichOutcomeLinks, SESSION_LOG_ID };
