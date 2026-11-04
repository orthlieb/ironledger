import { defineConfig } from 'vitest/config';

// `#lib/…` and `#icons/…` are subpath imports (package.json "imports"), which
// Vite resolves on its own, so tests load modules exactly as the app does.
export default defineConfig({
	test: {
		name: 'unit',
		include: ['tests/unit/**/*.test.ts'],
		// A DOM for the tests that need one. sanitize.test.ts opts into jsdom
		// instead (see its header): newer DOMPurify releases misbehave on
		// happy-dom, while jsdom matches the browser.
		environment: 'happy-dom',
		coverage: {
			provider: 'v8',
			include: ['src/lib/**/*.ts'],
			exclude: [],
		},
	},
});
