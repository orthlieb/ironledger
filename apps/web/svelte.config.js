import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			out: 'build',
			precompress: false,
		}),
		alias: {
			$lib: './src/lib',
			$icons: './src/lib/icons',
		},
		// Check /_app/version.json every 5 min so an open window — the
		// installed app above all — learns a new deploy is out and shows
		// UpdateBanner (which also checks whenever the window comes back
		// into view).
		version: {
			pollInterval: 5 * 60_000,
		},
	},
};

export default config;
