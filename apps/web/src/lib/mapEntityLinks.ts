// =============================================================================
// Iron Ledger — Map marker entity-link vocabulary
//
// A marker on the campaign map can carry an `entityId` that points at a
// first-class entity in the connections deck or expeditions area:
//
//   entityId = "community:<uuid>"  ← Community from the connections tab
//   entityId = "place:<uuid>"      ← Place from the connections tab
//   entityId = "journey:<uuid>"    ← Journey from the expeditions tab
//   entityId = "site:<uuid>"       ← Delve site from the expeditions tab
//
// The store field is already reserved (see mapStore.svelte.ts's MapMarker);
// this file adds the read/enumerate/parse/format helpers and the kind
// vocabulary the editor dropdown displays.
//
// Deliberately excludes NPCs (they live at communities/places, not at
// fixed hexes) and Foes (transient encounters, not spatial anchors) —
// same call the /vital-family and command-bar / autocomplete family
// already made in earlier tiers.
// =============================================================================

import { getCommunities } from './communityStore.svelte.js';
import { getPlaces } from './placeStore.svelte.js';
import { getExpeditions } from './expeditionStore.svelte.js';

/** Kinds of entities a marker can link to. Order + display comes from
 *  ENTITY_LINK_KINDS below. */
export const ENTITY_LINK_KINDS_LIST = ['community', 'place', 'journey', 'site'] as const;
export type EntityLinkKind = (typeof ENTITY_LINK_KINDS_LIST)[number];

/** Per-kind metadata: label for the picker, glyph shown before the name,
 *  and sort order (kind first, then name alphabetical). Glyphs picked to
 *  visually cluster kinds in a long dropdown without a proper optgroup. */
export const ENTITY_LINK_KINDS: Record<
	EntityLinkKind,
	{ label: string; prefix: string; order: number }
> = {
	community: { label: 'Community', prefix: '◈', order: 0 },
	place: { label: 'Place', prefix: '●', order: 1 },
	journey: { label: 'Journey', prefix: '↗', order: 2 },
	site: { label: 'Site', prefix: '▲', order: 3 },
};

/** Resolved entity — snapshot suitable for the picker + click-through. */
export interface EntityLink {
	kind: EntityLinkKind;
	id: string;
	name: string;
	kindLabel: string;
	kindPrefix: string;
}

/**
 * Flatten every linkable entity across the four stores into a single
 * sorted array. Ordering: kind (community → place → journey → site),
 * then name alphabetical. Names default to "Unnamed" to avoid an
 * unclickable empty row in the picker.
 */
export function getLinkableEntities(): EntityLink[] {
	const out: EntityLink[] = [];
	for (const c of getCommunities()) {
		out.push({
			kind: 'community',
			id: c.id,
			name: c.name || 'Unnamed',
			kindLabel: 'Community',
			kindPrefix: '◈',
		});
	}
	for (const p of getPlaces()) {
		out.push({
			kind: 'place',
			id: p.id,
			name: p.name || 'Unnamed',
			kindLabel: 'Place',
			kindPrefix: '●',
		});
	}
	for (const e of getExpeditions()) {
		if (e.type === 'journey') {
			out.push({
				kind: 'journey',
				id: e.id,
				name: e.name || 'Unnamed',
				kindLabel: 'Journey',
				kindPrefix: '↗',
			});
		} else if (e.type === 'site') {
			out.push({
				kind: 'site',
				id: e.id,
				name: e.name || 'Unnamed',
				kindLabel: 'Site',
				kindPrefix: '▲',
			});
		}
	}
	return out.sort((a, b) => {
		const ka = ENTITY_LINK_KINDS[a.kind].order;
		const kb = ENTITY_LINK_KINDS[b.kind].order;
		if (ka !== kb) return ka - kb;
		return a.name.localeCompare(b.name);
	});
}

/**
 * Split "kind:id" into parts. Returns null for missing / malformed input;
 * caller treats null as "no link" (or "link to a since-deleted entity",
 * depending on context).
 */
export function parseEntityId(
	entityId: string | undefined | null,
): { kind: EntityLinkKind; id: string } | null {
	if (!entityId) return null;
	const idx = entityId.indexOf(':');
	if (idx <= 0 || idx === entityId.length - 1) return null;
	const kind = entityId.slice(0, idx);
	const id = entityId.slice(idx + 1);
	if (!(kind in ENTITY_LINK_KINDS)) return null;
	return { kind: kind as EntityLinkKind, id };
}

/** Reverse of parseEntityId — "kind:id" from parts. */
export function formatEntityId(kind: EntityLinkKind, id: string): string {
	return `${kind}:${id}`;
}

/**
 * Resolve a stored entityId to the live entity — or null when the entity
 * has been deleted / renamed away. MapDialog uses this to render the
 * "(unlinked)" indicator on markers whose linked entity is gone.
 */
export function resolveEntity(entityId: string | undefined | null): EntityLink | null {
	const parsed = parseEntityId(entityId);
	if (!parsed) return null;
	return getLinkableEntities().find((e) => e.kind === parsed.kind && e.id === parsed.id) ?? null;
}
