import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig }  from 'vite';
import { readFileSync }  from 'fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf-8')) as { version: string };

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 5173,
	},
	define: {
		// Replaced at build time — read in admin panel to show version/deploy info.
		__APP_VERSION__: JSON.stringify(version),
		__BUILD_DATE__:  JSON.stringify(new Date().toISOString()),
	},
});
