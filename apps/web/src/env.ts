// Environment variables the app reads at runtime (SvelteKit 3's $app/env).
// Both are dynamic and private: read on the server when it starts, like the
// $env/dynamic/private they replace, so one build works in every environment.
import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	INTERNAL_API_URL: {
		description: 'Base URL of the Fastify API as seen from the SvelteKit server process.',
		schema: (value) => value ?? 'http://localhost:3000',
	},
	HCAPTCHA_SITE_KEY: {
		description: 'hCaptcha site key. Public: the login and register pages send it to the browser.',
		schema: (value) => value ?? '',
	},
});
