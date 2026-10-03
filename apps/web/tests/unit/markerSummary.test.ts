/**
 * The marker card shows only what's written: a linked Connection's name,
 * kind and Summary (shortDescription) — nothing generated from its other
 * fields or a settlement recipe. Unlinked markers get their label and icon.
 */
import { describe, expect, it, vi } from 'vitest';

const ENTITIES: Record<string, unknown> = {
	'community:c1': {
		kind: 'community',
		data: { id: 'c1', name: 'Collima', type: 'Town', shortDescription: '  A hill town. ' },
	},
	'site:s1': { kind: 'site', data: { id: 's1', name: 'The Barrow', objective: 'Find the crown' } },
};
vi.mock('../../src/lib/mapEntityLinks.js', () => ({
	resolveEntityData: (id: string | undefined) => (id ? (ENTITIES[id] ?? null) : null),
}));

vi.mock('../../src/lib/entityKinds.js', () => ({
	ENTITY_KIND_META: {
		community: { label: 'Settlement', color: 'red' },
		site: { label: 'Site', color: 'blue' },
	},
}));

const { markerSummary } = await import('../../src/lib/markerSummary.js');
type Marker = Parameters<typeof markerSummary>[0];
type Icon = NonNullable<Parameters<typeof markerSummary>[1]>;

const marker = (o: Partial<Marker>): Marker => ({ id: 'm', x: 0, y: 0, label: '', icon: '', ...o });
const ICON = { label: 'Gold Mine', categoryLabel: 'Settlement' } as Icon;

describe('markerSummary', () => {
	it('uses the linked Connection: name, kind and its Summary as written', () => {
		const s = markerSummary(marker({ entityId: 'community:c1', label: 'old label' }), ICON);
		expect(s.title).toBe('Collima');
		expect(s.subtitle).toBe('Settlement');
		expect(s.summary).toBe('A hill town.');
		expect(s.linked?.kind).toBe('community');
	});

	it('generates nothing from other fields — no Summary means none shown', () => {
		const s = markerSummary(marker({ entityId: 'site:s1' }), ICON);
		expect(s.title).toBe('The Barrow');
		expect(s.summary).toBeUndefined();
		expect(Object.keys(s)).not.toContain('facts');
	});

	it('an unlinked marker gets its label and its icon name, nothing more', () => {
		const s = markerSummary(
			marker({
				label: 'Old Mine',
				settlement: { tier: 'town', culture: 'nysis', seed: 1 },
			}),
			ICON,
		);
		expect(s).toEqual({ title: 'Old Mine', subtitle: 'Gold Mine', linked: null });
	});

	it('a broken link falls back to the unlinked view', () => {
		const s = markerSummary(marker({ entityId: 'place:gone' }), ICON);
		expect(s.linked).toBeNull();
		expect(s.title).toBe('Gold Mine');
	});
});
