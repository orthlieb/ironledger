/**
 * entityContainment.test.ts
 *
 * Locks down the pure containment-tree helpers: ancestor/descendant walks,
 * the cycle guard the picker + setter rely on, delete reparenting
 * (grandparent-or-detach), the MD/JSON breadcrumb, and region inheritance.
 * No store, no reactivity — just the graph math.
 */
import { describe, it, expect } from 'vitest';
import {
	buildGraph,
	isContainerRef,
	containerRef,
	ancestorRefs,
	isAncestor,
	wouldCreateCycle,
	descendantRefs,
	eligibleContainerRefs,
	reparentOnDelete,
	breadcrumbRefs,
	effectiveRegion,
	isNested,
	type ContainmentNode,
} from '../../src/lib/entityContainment.js';

// Fixture tree (Nysis is a Place per the design decision):
//   place:nysis           region "Nysis Reach"      (top-level)
//     community:collima    (no region → inherits)
//       npc:bob
//       place:tavern       region "Tavern Row"
//   community:freeport     region "Coast"           (top-level, separate tree)
//   npc:solo               (no within, no region)
const NODES: ContainmentNode[] = [
	{ ref: 'place:nysis', region: 'Nysis Reach' },
	{ ref: 'community:collima', within: 'place:nysis' },
	{ ref: 'npc:bob', within: 'community:collima' },
	{ ref: 'place:tavern', within: 'community:collima', region: 'Tavern Row' },
	{ ref: 'community:freeport', region: 'Coast' },
	{ ref: 'npc:solo' },
];
const g = buildGraph(NODES);

describe('ref helpers', () => {
	it('isContainerRef is true only for settlement/landmark refs', () => {
		expect(isContainerRef('community:collima')).toBe(true);
		expect(isContainerRef('place:nysis')).toBe(true);
		expect(isContainerRef('npc:bob')).toBe(false);
		expect(isContainerRef('journey:x')).toBe(false);
		expect(isContainerRef('garbage')).toBe(false);
	});
	it('containerRef formats "kind:id"', () => {
		expect(containerRef('community', 'abc')).toBe('community:abc');
		expect(containerRef('place', 'xyz')).toBe('place:xyz');
	});
});

describe('ancestors + breadcrumb', () => {
	it('walks the within chain nearest-first', () => {
		expect(ancestorRefs('npc:bob', g)).toEqual(['community:collima', 'place:nysis']);
		expect(ancestorRefs('place:nysis', g)).toEqual([]);
	});
	it('breadcrumb is the chain top-to-bottom', () => {
		expect(breadcrumbRefs('npc:bob', g)).toEqual(['place:nysis', 'community:collima']);
		expect(breadcrumbRefs('community:freeport', g)).toEqual([]);
	});
	it('isAncestor reflects the chain', () => {
		expect(isAncestor('place:nysis', 'npc:bob', g)).toBe(true);
		expect(isAncestor('community:collima', 'npc:bob', g)).toBe(true);
		expect(isAncestor('community:freeport', 'npc:bob', g)).toBe(false);
	});
	it('is cycle-safe on corrupt data (no infinite loop)', () => {
		const bad = buildGraph([
			{ ref: 'a', within: 'b' },
			{ ref: 'b', within: 'a' },
		]);
		expect(ancestorRefs('a', bad)).toEqual(['b']);
	});
});

describe('cycle guard', () => {
	it('rejects self-parenting and parenting under a descendant', () => {
		expect(wouldCreateCycle('place:nysis', 'place:nysis', g)).toBe(true); // self
		expect(wouldCreateCycle('place:nysis', 'community:collima', g)).toBe(true); // descendant
		expect(wouldCreateCycle('place:nysis', 'npc:bob', g)).toBe(true); // deeper descendant
	});
	it('allows an unrelated container', () => {
		expect(wouldCreateCycle('place:nysis', 'community:freeport', g)).toBe(false);
		expect(wouldCreateCycle('npc:solo', 'community:collima', g)).toBe(false);
	});
});

describe('descendants + eligible containers', () => {
	it('descendantRefs is the whole subtree', () => {
		expect(descendantRefs('place:nysis', g)).toEqual(
			new Set(['community:collima', 'npc:bob', 'place:tavern']),
		);
		expect(descendantRefs('npc:bob', g)).toEqual(new Set());
	});
	it('eligible containers exclude self, descendants, and non-containers', () => {
		// nysis: only freeport is a valid parent (collima/tavern are descendants,
		// bob/solo are NPCs, nysis is self).
		expect(eligibleContainerRefs('place:nysis', g)).toEqual(['community:freeport']);
		// a leaf NPC can go under any of the four containers.
		expect(new Set(eligibleContainerRefs('npc:solo', g))).toEqual(
			new Set(['place:nysis', 'community:collima', 'place:tavern', 'community:freeport']),
		);
	});
});

describe('reparent on delete', () => {
	it('lifts children to the grandparent', () => {
		// delete Collima → Bob + the Tavern move up to Nysis (Collima's parent).
		expect(reparentOnDelete('community:collima', g)).toEqual([
			{ ref: 'npc:bob', within: 'place:nysis' },
			{ ref: 'place:tavern', within: 'place:nysis' },
		]);
	});
	it('detaches children when the deleted node had no parent', () => {
		// delete Nysis (top-level) → Collima detaches (within: undefined).
		expect(reparentOnDelete('place:nysis', g)).toEqual([
			{ ref: 'community:collima', within: undefined },
		]);
	});
	it('returns nothing for a leaf', () => {
		expect(reparentOnDelete('npc:bob', g)).toEqual([]);
	});
});

describe('region inheritance', () => {
	it('uses own region when set', () => {
		expect(effectiveRegion('place:nysis', g)).toBe('Nysis Reach');
		expect(effectiveRegion('place:tavern', g)).toBe('Tavern Row');
		expect(effectiveRegion('community:freeport', g)).toBe('Coast');
	});
	it('inherits from the nearest ancestor with a region', () => {
		// Collima has no own region → inherits Nysis Reach.
		expect(effectiveRegion('community:collima', g)).toBe('Nysis Reach');
		// Bob (NPC, no region) also resolves to the chain's region.
		expect(effectiveRegion('npc:bob', g)).toBe('Nysis Reach');
	});
	it('is undefined when neither node nor ancestors carry a region', () => {
		expect(effectiveRegion('npc:solo', g)).toBeUndefined();
	});
	it('isNested reflects a set parent', () => {
		expect(isNested('community:collima', g)).toBe(true);
		expect(isNested('place:nysis', g)).toBe(false);
	});
});
