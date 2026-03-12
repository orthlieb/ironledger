/**
 * Server-only runtime config.
 *
 * Uses $env/dynamic/private so the values are read at startup, not
 * baked in at build time — correct for a URL that differs between
 * local dev, staging, and production.
 */
import { env } from '$env/dynamic/private';

/** Base URL of the Fastify API as seen from the SvelteKit server process. */
export const INTERNAL_API_URL: string =
	env.INTERNAL_API_URL ?? 'http://localhost:3000';
