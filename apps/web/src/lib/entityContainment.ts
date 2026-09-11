// =============================================================================
// Iron Ledger — Connection containment graph (the "Within / Located In" tree)
//
// Settlements, Landmarks and NPCs can each sit *within* a container — a
// settlement or a landmark — forming a single-parent forest ("Bob is in
// Collima, which is within Nysis"). The parent is stored as a "kind:id"
// entity ref (the same vocabulary map markers use, see mapEntityLinks.ts),
// so a child self-describes its container's kind without a lookup.
//
// This module is PURE: it takes a flat list of nodes and answers questions
// about the tree — ancestors, cycle-safety for the picker/guard, delete
// reparenting, the breadcrumb for MD export, and region inheritance. It
// imports no store and touches no reactive state, so it is unit-tested in
// isolation (entityContainment.test.ts).
//
// Design decisions (see docs/communities.md + the design thread):
//   • Single parent → a tree, not a DAG. "Where is X?" has one answer.
//   • Containers are settlements/landmarks only; NPCs are always leaves.
//   • At most one settlement per root-to-leaf path: a settlement may not sit
//     (even transitively) inside another settlement, so a settlement's parent
//     is always a landmark. isEligibleContainer is the single guard the
//     picker, the setter, and the import sanitizer all share.
//   • Nothing is denormalised: the breadcrumb and effective region are
//     DERIVED by walking `within`, so moving a parent needs no rewrite.
//   • Deleting a container reparents its children to the container's own
//     parent (grandparent), or detaches them when it had no parent.
// =============================================================================

// This module stays store-free (and therefore trivially unit-testable), so the
// tiny "kind:id" ref split is inlined rather than imported from the
// store-coupled mapEntityLinks.ts. The format is identical, so refs are
// interchangeable with marker entity links.

/** Kinds that can act as a container (a parent). */
export type ContainerKind = 'community' | 'place';
/** Kinds that can be contained (carry a `within`). */
export type ContainableKind = 'community' | 'place' | 'npc';

/** Minimal shape the containment graph needs from any connection entity. The
 *  caller maps its Community / Place / Npc records onto this. */
export interface ContainmentNode {
	/** This node's own entity ref, "kind:id" (e.g. "place:abc"). */
	ref: string;
	/** Parent ref ("community:id" | "place:id"), or undefined when top-level. */
	within?: string;
	/** Own region — communities/places only; NPCs have none. Used by
	 *  effectiveRegion as the walk's stopping value. */
	region?: string;
}

/** Build the ref → node lookup the query functions operate on. Later
 *  duplicates for a ref win (shouldn't happen — refs are unique). */
export function buildGraph(nodes: readonly ContainmentNode[]): Map<string, ContainmentNode> {
	return new Map(nodes.map((n) => [n.ref, n]));
}

/** The kind segment of a "kind:id" ref, or null when malformed. */
function refKind(ref: string): string | null {
	const idx = ref.indexOf(':');
	if (idx <= 0 || idx === ref.length - 1) return null;
	return ref.slice(0, idx);
}

/** True when `ref` names a settlement (a Community). Settlements are the kind
 *  constrained to one-per-chain. */
function isSettlementRef(ref: string): boolean {
	return refKind(ref) === 'community';
}

/** True when `ref` names a container kind (settlement or landmark). */
export function isContainerRef(ref: string): boolean {
	const kind = refKind(ref);
	return kind === 'community' || kind === 'place';
}

/** Make a container ref from parts ("community:<id>" / "place:<id>"). */
export function containerRef(kind: ContainerKind, id: string): string {
	return `${kind}:${id}`;
}

/**
 * Ancestor refs of `ref`, nearest first: [parent, grandparent, …root]. Walks
 * the `within` chain and is cycle-safe — a malformed loop (data corruption)
 * stops at the repeat rather than spinning forever. `ref` itself is not
 * included; a missing parent ends the walk.
 */
export function ancestorRefs(ref: string, graph: ReadonlyMap<string, ContainmentNode>): string[] {
	const out: string[] = [];
	const seen = new Set<string>([ref]);
	let cur = graph.get(ref)?.within;
	while (cur && !seen.has(cur)) {
		out.push(cur);
		seen.add(cur);
		cur = graph.get(cur)?.within;
	}
	return out;
}

/** True when `candidateRef` is an ancestor of `ref`. */
export function isAncestor(
	candidateRef: string,
	ref: string,
	graph: ReadonlyMap<string, ContainmentNode>,
): boolean {
	return ancestorRefs(ref, graph).includes(candidateRef);
}

/**
 * Would setting `childRef.within = newParentRef` create a cycle? True when the
 * new parent is the child itself or already sits somewhere in the child's
 * subtree (i.e. the child is an ancestor of the proposed parent). The picker
 * uses this to exclude ineligible options; the setter uses it as a guard.
 */
export function wouldCreateCycle(
	childRef: string,
	newParentRef: string,
	graph: ReadonlyMap<string, ContainmentNode>,
): boolean {
	if (newParentRef === childRef) return true;
	return isAncestor(childRef, newParentRef, graph);
}

/** Every ref whose ancestor chain passes through `ref` (its whole subtree,
 *  excluding `ref` itself). */
export function descendantRefs(
	ref: string,
	graph: ReadonlyMap<string, ContainmentNode>,
): Set<string> {
	const out = new Set<string>();
	for (const other of graph.keys()) {
		if (other !== ref && ancestorRefs(other, graph).includes(ref)) out.add(other);
	}
	return out;
}

/** True when `ref` is a settlement, or any of its ancestors is. Backs the
 *  one-settlement-per-chain rule (a chain that already holds a settlement). */
export function chainHasSettlement(
	ref: string,
	graph: ReadonlyMap<string, ContainmentNode>,
): boolean {
	return isSettlementRef(ref) || ancestorRefs(ref, graph).some(isSettlementRef);
}

/** True when `ref` is a settlement, or any node in its subtree is. A subtree
 *  that carries a settlement can't be dropped under a chain that already has
 *  one. */
export function subtreeHasSettlement(
	ref: string,
	graph: ReadonlyMap<string, ContainmentNode>,
): boolean {
	if (isSettlementRef(ref)) return true;
	for (const d of descendantRefs(ref, graph)) if (isSettlementRef(d)) return true;
	return false;
}

/**
 * May `childRef` be placed within `parentRef`? The single source of truth for
 * the containment rules — the picker, the setter guard, and the import
 * sanitizer all funnel through here:
 *   • the parent must be a container (settlement/landmark); NPCs are leaves;
 *   • no cycle — the parent may not be the child itself or sit in the child's
 *     own subtree;
 *   • at most one settlement per root-to-leaf path — a child subtree that
 *     carries a settlement may not go under a chain that already has one. This
 *     also blocks settlement-within-settlement outright: a settlement's subtree
 *     always "carries a settlement" (itself), so it can only land under a
 *     settlement-free chain — i.e. under a landmark with no settlement above.
 */
export function isEligibleContainer(
	childRef: string,
	parentRef: string,
	graph: ReadonlyMap<string, ContainmentNode>,
): boolean {
	if (childRef === parentRef) return false;
	if (!isContainerRef(parentRef)) return false;
	if (wouldCreateCycle(childRef, parentRef, graph)) return false;
	if (subtreeHasSettlement(childRef, graph) && chainHasSettlement(parentRef, graph)) return false;
	return true;
}

/**
 * Container refs that `selfRef` may be placed within — every container that
 * satisfies isEligibleContainer (not self, not a descendant, not a chain that
 * would put two settlements on one path). Order is preserved from the graph's
 * insertion order; the caller sorts for display.
 */
export function eligibleContainerRefs(
	selfRef: string,
	graph: ReadonlyMap<string, ContainmentNode>,
): string[] {
	const out: string[] = [];
	for (const ref of graph.keys()) {
		if (isEligibleContainer(selfRef, ref, graph)) out.push(ref);
	}
	return out;
}

/**
 * When a container is deleted, where do its direct children go? Each child is
 * lifted to the deleted node's own parent (grandparent) — but only when that
 * keeps the rules (isEligibleContainer against the post-delete graph); otherwise
 * the child detaches (`within: undefined`). A child always detaches when the
 * deleted node had no parent. Returns one entry per affected child; refs not
 * listed are unchanged.
 *
 * The eligibility check matters: deleting a landmark that sits between two
 * settlements (settlement → landmark → settlement) would otherwise lift the
 * lower settlement straight under the upper one, quietly breaking the
 * one-settlement-per-chain rule. Here it detaches instead.
 */
export function reparentOnDelete(
	deletedRef: string,
	graph: ReadonlyMap<string, ContainmentNode>,
): Array<{ ref: string; within: string | undefined }> {
	const grandparent = graph.get(deletedRef)?.within;
	// The graph as it will be once `deletedRef` is gone — children are judged
	// against that (their own `within` still names the doomed node, but the
	// eligibility checks walk down from the child and up from the grandparent,
	// never up through the deleted node, so this is sound).
	const afterDelete = new Map(graph);
	afterDelete.delete(deletedRef);
	const out: Array<{ ref: string; within: string | undefined }> = [];
	for (const [ref, node] of graph) {
		if (node.within !== deletedRef) continue;
		const within =
			grandparent && isEligibleContainer(ref, grandparent, afterDelete) ? grandparent : undefined;
		out.push({ ref, within });
	}
	return out;
}

/**
 * Repair a proposed forest so it obeys the containment rules — used by the
 * importer, where an incoming file may describe illegal nesting. Takes the
 * proposed nodes (each with the `within` the import wants to set) and returns a
 * `ref → within` map with every offending link stripped:
 *   • a `within` that names an unknown, non-container, self, or cycle-forming
 *     parent is dropped;
 *   • whenever a settlement ends up with a settlement ancestor, the deeper
 *     (descendant) settlement is detached — enforcing one settlement per chain.
 * Runs to a fixed point (each pass removes at least one link), so the result is
 * always a valid forest. Deterministic in the nodes' order.
 */
export function sanitizeContainment(
	nodes: readonly ContainmentNode[],
): Map<string, string | undefined> {
	const present = new Set(nodes.map((n) => n.ref));
	const within = new Map<string, string>();
	for (const n of nodes) if (n.within) within.set(n.ref, n.within);

	const rebuild = () => buildGraph(nodes.map((n) => ({ ...n, within: within.get(n.ref) })));

	let changed = true;
	while (changed) {
		changed = false;
		const graph = rebuild();
		// Structural: dangling / non-container / self / cycle-forming parents.
		for (const [ref, parent] of [...within]) {
			if (
				!present.has(parent) ||
				!isContainerRef(parent) ||
				parent === ref ||
				wouldCreateCycle(ref, parent, graph)
			) {
				within.delete(ref);
				changed = true;
			}
		}
		if (changed) continue; // rebuild before judging chains
		// One settlement per chain: detach any settlement with a settlement ancestor.
		const settled = rebuild();
		for (const ref of [...within.keys()]) {
			if (isSettlementRef(ref) && ancestorRefs(ref, settled).some(isSettlementRef)) {
				within.delete(ref);
				changed = true;
			}
		}
	}

	const result = new Map<string, string | undefined>();
	for (const n of nodes) result.set(n.ref, within.get(n.ref));
	return result;
}

/**
 * Ordered ancestor chain top-to-bottom for a breadcrumb: [root, …, parent].
 * Empty for a top-level node. MD/JSON export walk this to emit
 * `[[Nysis]] / [[Collima]]` links, computed fresh so reparenting never needs a
 * stored path rewrite.
 */
export function breadcrumbRefs(ref: string, graph: ReadonlyMap<string, ContainmentNode>): string[] {
	return ancestorRefs(ref, graph).reverse();
}

/**
 * The region that applies to `ref`: its own region if set, otherwise inherited
 * from the nearest ancestor that has one. Undefined when neither the node nor
 * any ancestor carries a region. Derived (not stored), so a nested entity's
 * region follows its parent — including after a reparent.
 */
export function effectiveRegion(
	ref: string,
	graph: ReadonlyMap<string, ContainmentNode>,
): string | undefined {
	// Walk to the ROOT of the tree — the region on the top-level entry applies to
	// everything under it. Intermediate nodes are themselves nested, so their own
	// (stale/copied) region must be ignored: Freeport within Altiplano within
	// Buralia inherits BURALIA's region, not Altiplano's. Cycle-safe.
	const seen = new Set<string>();
	let cur: string | undefined = ref;
	while (cur && !seen.has(cur)) {
		seen.add(cur);
		const node = graph.get(cur);
		if (!node) return undefined;
		if (!node.within) return node.region;
		cur = node.within;
	}
	return undefined;
}

/** True when `ref` has a `within` parent (its region/breadcrumb are inherited,
 *  so the Region field renders read-only). */
export function isNested(ref: string, graph: ReadonlyMap<string, ContainmentNode>): boolean {
	return !!graph.get(ref)?.within;
}
