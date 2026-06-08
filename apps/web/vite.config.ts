import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const { version } = JSON.parse(readFileSync('package.json', 'utf-8')) as { version: string };

// Use the last git commit timestamp so the build date always reflects the
// most recent push rather than when the dev server happened to start.
const buildDate = (() => {
	try {
		return execSync('git log -1 --format=%cI').toString().trim();
	} catch {
		return new Date().toISOString();
	}
})();

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 5173,
		fs: {
			// Allow serving files from the monorepo root when running from a
			// git worktree whose node_modules is symlinked back to the root.
			allow: ['..', '../..', '/Users/orthlieb/dev/ironledger'],
		},
	},
	define: {
		// Replaced at build time — read in admin panel to show version/deploy info.
		__APP_VERSION__: JSON.stringify(version),
		__BUILD_DATE__: JSON.stringify(buildDate),
	},
});
