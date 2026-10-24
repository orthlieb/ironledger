import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// The active livery's icons, as fontStore reads them from the manifest (its
// `$state` needs the Svelte compiler, which the unit config doesn't run).
const livery = vi.hoisted(() => ({ icons: {} as Record<string, string> }));
vi.mock('../../src/lib/fontStore.svelte.js', () => ({
	activeLiveryIcons: () => livery.icons,
}));

const { APP_ICONS, LIVERY_ICON_NAMES, appIcon } = await import('../../src/lib/liveryIcons.js');
const { ENTITY_KIND_META } = await import('../../src/lib/entityKinds.js');

describe('livery icons', () => {
	afterEach(() => {
		livery.icons = {};
	});

	it("has the app's own icon for every replaceable one", () => {
		for (const name of LIVERY_ICON_NAMES) expect(APP_ICONS[name], name).toMatch(/^<svg/);
	});

	it('names the same icons the livery linter accepts', () => {
		// Vitest runs from apps/web (happy-dom's import.meta.url isn't a file URL).
		const lint = readFileSync(path.resolve('../../scripts/lint-liveries.mjs'), 'utf8');
		const list = lint.match(/export const ICON_NAMES = \[([^\]]*)\]/)![1];
		expect([...list.matchAll(/'([a-z]+)'/g)].map((m) => m[1])).toEqual([...LIVERY_ICON_NAMES]);
	});

	it("draws the app's own where the livery ships none", () => {
		for (const name of LIVERY_ICON_NAMES) expect(appIcon(name)).toBe(APP_ICONS[name]);
		expect(ENTITY_KIND_META.community.icon).toBe(APP_ICONS.settlements);
	});

	it("draws the livery's own where it ships one — the kinds' too", () => {
		livery.icons = { characters: '<svg>c</svg>', settlements: '<svg>s</svg>' };
		expect(appIcon('characters')).toBe('<svg>c</svg>');
		expect(appIcon('foes')).toBe(APP_ICONS.foes);
		expect(ENTITY_KIND_META.community.icon).toBe('<svg>s</svg>');
		expect(ENTITY_KIND_META.place.icon).toBe(APP_ICONS.landmarks);
	});
});
