// Every catalogue fetch revalidates its cached copy (#lib/catalogueFetch.ts):
// a store that fetches /api/catalogue… itself can be handed the copy from
// before a deploy, in the old shape.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '../../src');

function sources(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) return sources(p);
		return /\.(ts|js|svelte)$/.test(name) ? [p] : [];
	});
}

describe('catalogue fetches', () => {
	it('go through fetchCatalogue', () => {
		const direct = sources(SRC)
			.filter((p) => !p.endsWith('catalogueFetch.ts'))
			.filter((p) => /\bfetch\(\s*['"`]\/api\/catalogue/.test(readFileSync(p, 'utf8')))
			.map((p) => relative(SRC, p));
		expect(direct).toEqual([]);
	});
});
