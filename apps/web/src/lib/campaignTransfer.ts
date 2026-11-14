// =============================================================================
// Iron Ledger — what import and export share
//
// Portraits: the blob store <-> inline base64 bridges. Containment: the
// "kind:id" refs a settlement, landmark or NPC uses for the entity it sits
// within, and the live containment graph the export walks for regions and
// breadcrumbs. See campaignImport.svelte.ts and campaignExport.svelte.ts.
// =============================================================================

import { getCommunities } from '#lib/communityStore.svelte.js';
import { getNpcs } from '#lib/npcStore.svelte.js';
import { getPlaces } from '#lib/placeStore.svelte.js';
import { buildGraph, type ContainmentNode } from '#lib/entityContainment.js';

// ── Portrait blob ↔ inline base64 bridges ───────────────────────────────────
// Portraits live in the content-addressed blob store, not the entity JSON.
// Export re-embeds them inline (the pre-Tier-2 shape) so a single file stays
// self-contained and portable; import lifts inline portraits back into the
// (deduping) blob store. Old exports that already carry inline portraits flow
// through the same import path unchanged.

/** Fetch a portrait by URL and return it as a base64 data URL ('' on failure). */
export async function fetchPortraitDataUrl(url: string): Promise<string> {
	try {
		const res = await fetch(url, { credentials: 'include' });
		if (!res.ok) return '';
		const blob = await res.blob();
		return await new Promise<string>((resolve, reject) => {
			const fr = new FileReader();
			fr.onload = () => resolve(fr.result as string);
			fr.onerror = () => reject(fr.error);
			fr.readAsDataURL(blob);
		});
	} catch {
		return '';
	}
}

/** PUT an inline base64 portrait to an entity's blob endpoint; returns the
 *  stored content hash (etag), or '' on failure. */
export async function uploadPortrait(endpoint: string, dataUrl: string): Promise<string> {
	try {
		const res = await fetch(endpoint, {
			method: 'PUT',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ dataUrl }),
		});
		if (!res.ok) return '';
		const { etag } = (await res.json()) as { etag: string };
		return etag ?? '';
	} catch {
		return '';
	}
}

/** Pull an inline base64 data URL off an object's field and delete it. Returns
 *  '' when absent or not a data: URL (https values are left untouched). */
export function takeInlineDataUrl(obj: Record<string, unknown>, key: string): string {
	const v = obj[key];
	if (typeof v === 'string' && v.startsWith('data:')) {
		delete obj[key];
		return v;
	}
	return '';
}

// ── Containment refs ("kind:id") against the live stores ─────────────────────

export const refOf = (kind: 'community' | 'place' | 'npc', id: string) => `${kind}:${id}`;
export function entityWithin(e: {
	within?: string;
	withinSettlementId?: string;
}): string | undefined {
	return e.within ?? (e.withinSettlementId ? refOf('community', e.withinSettlementId) : undefined);
}
export function splitRef(ref: string): { kind: 'community' | 'place' | 'npc'; id: string } | null {
	const i = ref.indexOf(':');
	return i > 0
		? { kind: ref.slice(0, i) as 'community' | 'place' | 'npc', id: ref.slice(i + 1) }
		: null;
}
/** Name of a "kind:id" ref against the live stores, '' if gone. */
export function refName(ref: string): string {
	const p = splitRef(ref);
	if (!p) return '';
	const list =
		p.kind === 'community' ? getCommunities() : p.kind === 'place' ? getPlaces() : getNpcs();
	return list.find((e) => e.id === p.id)?.name ?? '';
}

/** The containment graph of every settlement, landmark and NPC, for the
 *  export's regions and Within / Contains lines. */
export function liveContainmentGraph(): Map<string, ContainmentNode> {
	const communities = getCommunities();
	const places = getPlaces();
	const npcs = getNpcs();
	return buildGraph([
		...communities.map(
			(c): ContainmentNode => ({
				ref: refOf('community', c.id),
				within: entityWithin(c),
				region: c.region,
			}),
		),
		...places.map(
			(p): ContainmentNode => ({
				ref: refOf('place', p.id),
				within: entityWithin(p),
				region: p.region,
			}),
		),
		...npcs.map((n): ContainmentNode => ({ ref: refOf('npc', n.id), within: entityWithin(n) })),
	]);
}
