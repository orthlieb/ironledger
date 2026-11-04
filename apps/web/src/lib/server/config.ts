/**
 * Server-only runtime config.
 *
 * Declared in src/env.ts and read through $app/env/private, so the values
 * are read at startup, not baked in at build time: correct for a URL that
 * differs between local dev, staging, and production. The defaults live in
 * src/env.ts.
 */
export { INTERNAL_API_URL, HCAPTCHA_SITE_KEY } from '$app/env/private';
