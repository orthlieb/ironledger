import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	// The app's `$icons` alias (svelte.config.js), so a module that imports
	// its icons (`$icons/….svg?raw`) loads under test as it does in the app.
	resolve: {
		alias: { $icons: fileURLToPath(new URL('./src/lib/icons', import.meta.url)) },
	},
	test: {
		name: 'unit',
		include: ['tests/unit/**/*.test.ts'],
		// happy-dom gives us a real DOM so isomorphic-dompurify runs in browser mode
		// (the same code path as the actual app) rather than falling back to a
		// server-side stub that skips most sanitisation.
		environment: 'happy-dom',
		coverage: {
			provider: 'v8',
			include: ['src/lib/**/*.ts'],
			exclude: [],
		},
	},
});
