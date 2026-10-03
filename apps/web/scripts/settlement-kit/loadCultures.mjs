// =============================================================================
// Settlement kit — read the culture plugins from disk (Node-side tools only)
//
// Cultures are extension content: apps/api/data/cultures/*.json for the base
// game and extensions/<id>/cultures/*.json for each extension. The app gets
// them from the API catalogue (/catalogue/cultures); the icon bake and the
// playground build read them straight from the files with this helper, tagging
// each with its `source` the same way the catalogue does.
// =============================================================================

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @typedef {import('../../src/lib/settlement-kit/generate.js').Culture} Culture */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

/** @param {string} dir @param {string} source @returns {Culture[]} */
function readDir(dir, source) {
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((f) => f.endsWith('.json'))
		.sort()
		.map((f) => ({ ...JSON.parse(readFileSync(join(dir, f), 'utf-8')), source }));
}

/**
 * Every culture, base first, then extensions in folder order.
 * @param {{includeDev?: boolean}} [o] include dev-only extensions (sample)
 * @returns {Culture[]}
 */
export function loadCultures(o = {}) {
	const out = readDir(join(REPO, 'apps', 'api', 'data', 'cultures'), 'base');
	const extRoot = join(REPO, 'extensions');
	for (const id of readdirSync(extRoot).sort()) {
		const meta = join(extRoot, id, 'extension.json');
		if (!existsSync(meta)) continue;
		if (JSON.parse(readFileSync(meta, 'utf-8')).dev && !o.includeDev) continue;
		out.push(...readDir(join(extRoot, id, 'cultures'), id));
	}
	return out;
}
