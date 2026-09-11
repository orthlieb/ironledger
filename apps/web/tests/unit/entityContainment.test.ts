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
	isEligibleContainer,
	chainHasSettlement,
	subtreeHasSettlement,
	reparentOnDelete,
	sanitizeContainment,
	breadcrumbRefs,
	effectiveRegion,
	isNested,
	type ContainmentNode,
} from '../../src/lib/entityContainment.js';

// Fixture tree (Nysis is a Place per the design decision). Collima and Tavern
// carry their OWN region values — but both are nested, so those must be ignored
// in favour of the tree root's region (the Freeport-within-Altiplano-within-
// Buralia bug: an intermediate node's own region must not win):
//   place:nysis           region "Nysis Reach"      (top-level = root)
//     community:collima    region "Collima County"  (nested → own region ignored)
//       npc:bob
//       place:tavern       region "Tavern Row"      (nested → own region ignored)
//   community:freeport     region "Coast"           (top-level, separate tree)
//   npc:solo               (no within, no region)
const NODES: ContainmentNode[] = [
	{ ref: 'place:nysis', region: 'Nysis Reach' },
	{ ref: 'community:collima', within: 'place:nysis', region: 'Collima County' },
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
	it('eligible containers exclude self, descendants, non-containers, and settlement chains', () => {
		// nysis' subtree carries a settlement (Collima), so it can only land under a
		// settlement-free chain. Freeport is a settlement, so it's out — leaving
		// nysis with NO eligible parent (collima/tavern are descendants, bob/solo
		// are NPCs, nysis is self).
		expect(eligibleContainerRefs('place:nysis', g)).toEqual([]);
		// Freeport (a settlement) may only go under a landmark whose chain has no
		// settlement — that's nysis alone. collima/tavern already sit under a
		// settlement; another settlement can't join their chain.
		expect(eligibleContainerRefs('community:freeport', g)).toEqual(['place:nysis']);
		// a leaf NPC (no settlement anywhere in its subtree) can go under any of the
		// four containers.
		expect(new Set(eligibleContainerRefs('npc:solo', g))).toEqual(
			new Set(['place:nysis', 'community:collima', 'place:tavern', 'community:freeport']),
		);
	});
});

describe('one settlement per chain', () => {
	it('chainHasSettlement walks up; subtreeHasSettlement walks down', () => {
		expect(chainHasSettlement('community:collima', g)).toBe(true); // itself
		expect(chainHasSettlement('place:tavern', g)).toBe(true); // ancestor Collima
		expect(chainHasSettlement('place:nysis', g)).toBe(false); // landmark root
		expect(chainHasSettlement('npc:solo', g)).toBe(false);

		expect(subtreeHasSettlement('place:nysis', g)).toBe(true); // Collima below
		expect(subtreeHasSettlement('community:collima', g)).toBe(true); // itself
		expect(subtreeHasSettlement('place:tavern', g)).toBe(false);
		expect(subtreeHasSettlement('npc:solo', g)).toBe(false);
	});

	it('isEligibleContainer blocks a second settlement on a path but allows siblings', () => {
		// A settlement can never nest under a chain that already has one…
		expect(isEligibleContainer('community:freeport', 'community:collima', g)).toBe(false); // direct
		expect(isEligibleContainer('community:freeport', 'place:tavern', g)).toBe(false); // transitive
		// …but two settlements on SEPARATE paths under one landmark is fine:
		// Freeport under Nysis gives nysis→collima and nysis→freeport, one each.
		expect(isEligibleContainer('community:freeport', 'place:nysis', g)).toBe(true);
		// A settlement-free leaf goes anywhere, even under a settlement's chain.
		expect(isEligibleContainer('npc:solo', 'community:collima', g)).toBe(true);
		// Still rejects non-containers, self, and cycles.
		expect(isEligibleContainer('npc:solo', 'npc:bob', g)).toBe(false); // NPC parent
		expect(isEligibleContainer('place:nysis', 'place:nysis', g)).toBe(false); // self
		expect(isEligibleContainer('place:nysis', 'community:collima', g)).toBe(false); // descendant
	});
});

describe('sanitizeContainment (import repair)', () => {
	const proposed = (links: Record<string, string | undefined>, extra: string[] = []) => {
		const refs = new Set(
			[...Object.keys(links), ...Object.values(links), ...extra].filter((r): r is string => !!r),
		);
		return [...refs].map((ref): ContainmentNode => ({ ref, within: links[ref] }));
	};

	it('passes a legal forest through untouched', () => {
		const out = sanitizeContainment(NODES);
		expect(out.get('community:collima')).toBe('place:nysis');
		expect(out.get('place:tavern')).toBe('community:collima');
		expect(out.get('npc:bob')).toBe('community:collima');
		expect(out.get('community:freeport')).toBeUndefined();
	});

	it('detaches a settlement nested directly in a settlement', () => {
		const out = sanitizeContainment(proposed({ 'community:b': 'community:a' }));
		expect(out.get('community:b')).toBeUndefined();
	});

	it('detaches the deeper settlement on a transitive two-settlement chain', () => {
		// A(settlement) → L(landmark) → B(settlement): B has a settlement ancestor.
		const out = sanitizeContainment(
			proposed({ 'place:l': 'community:a', 'community:b': 'place:l' }),
		);
		expect(out.get('place:l')).toBe('community:a'); // the landmark link survives
		expect(out.get('community:b')).toBeUndefined(); // the lower settlement detaches
	});

	it('drops a non-container, dangling, or self parent', () => {
		// NPC parent (present but not a container).
		expect(
			sanitizeContainment([{ ref: 'place:x', within: 'npc:n' }, { ref: 'npc:n' }]).get('place:x'),
		).toBeUndefined();
		// Dangling parent (not among the nodes at all).
		expect(
			sanitizeContainment([{ ref: 'place:x', within: 'place:ghost' }]).get('place:x'),
		).toBeUndefined();
		// Self parent.
		expect(
			sanitizeContainment([{ ref: 'place:x', within: 'place:x' }]).get('place:x'),
		).toBeUndefined();
	});

	it('breaks a cycle rather than looping', () => {
		const out = sanitizeContainment([
			{ ref: 'place:a', within: 'place:b' },
			{ ref: 'place:b', within: 'place:a' },
		]);
		// No cycle may survive — at most one link stands (both may be dropped).
		const links = [out.get('place:a'), out.get('place:b')].filter(Boolean);
		expect(links.length).toBeLessThanOrEqual(1);
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
	it('detaches instead of lifting when the grandparent would break the settlement rule', () => {
		// A(settlement) → L(landmark) → B(settlement). Deleting L must NOT lift B
		// under A (two settlements on one chain) — B detaches instead.
		const chain = buildGraph([
			{ ref: 'community:a' },
			{ ref: 'place:l', within: 'community:a' },
			{ ref: 'community:b', within: 'place:l' },
		]);
		expect(reparentOnDelete('place:l', chain)).toEqual([{ ref: 'community:b', within: undefined }]);
	});
});

describe('region inheritance', () => {
	it('a top-level node uses its own region', () => {
		expect(effectiveRegion('place:nysis', g)).toBe('Nysis Reach');
		expect(effectiveRegion('community:freeport', g)).toBe('Coast');
	});
	it('a nested node inherits the ROOT region, ignoring its own and intermediate ones', () => {
		// Collima is nested and has its OWN region ("Collima County"), but the
		// root (Nysis) wins.
		expect(effectiveRegion('community:collima', g)).toBe('Nysis Reach');
		// The Tavern is two levels deep (Collima → Nysis); both its own region
		// ("Tavern Row") AND the intermediate Collima's ("Collima County") are
		// ignored — it resolves all the way to the root. This is the bug fix.
		expect(effectiveRegion('place:tavern', g)).toBe('Nysis Reach');
		// Bob (NPC, no region) also resolves to the root region.
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
