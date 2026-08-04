import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { generate as generateMapIcons } from './scripts/build-map-icons.mjs';

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

/**
 * Regenerates src/lib/generated/mapIconManifest.ts from static/map/**\/*.{svg,png}
 * on every build and on any file change under static/map/ in dev. The
 * generator is a no-op when the manifest is already current, so we can
 * cheaply re-run it from a chokidar handler.
 */
function mapIconManifestPlugin() {
	return {
		name: 'ironledger:map-icon-manifest',
		buildStart() {
			generateMapIcons();
		},
		configureServer(server: {
			watcher: { add: (p: string) => void; on: (evt: string, cb: (p: string) => void) => void };
		}) {
			server.watcher.add('static/map');
			const onChange = (path: string) => {
				if (!/[\\/]static[\\/]map[\\/]/.test(path)) return;
				if (!/\.(svg|png)$/i.test(path)) return;
				generateMapIcons();
			};
			server.watcher.on('add', onChange);
			server.watcher.on('unlink', onChange);
			server.watcher.on('change', onChange);
		},
	};
}

export default defineConfig({
	plugins: [mapIconManifestPlugin(), sveltekit()],
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
