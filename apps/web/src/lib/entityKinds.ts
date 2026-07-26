// =============================================================================
// Iron Ledger — Shared entity-kind metadata (color, icon, label)
//
// Communities/Places/NPCs live in the Connections rail; Journeys/Sites live in
// the Expeditions area; Markers on the Campaign Map can link to any of the
// four "spatial" kinds (community, place, journey, site — NPCs are excluded,
// see `mapEntityLinks.ts`). Each place used to redeclare its own colour,
// icon, and label triples — that drifted (e.g. two identical shades of blue
// in different files, "Place" vs "Location" naming). This file is the single
// source of truth; consumers import `ENTITY_KIND_META` and read the field
// they need.
//
// SVG imports use Vite's `?raw` suffix and resolve to the icon's inner
// markup for `{@html …}` inlining — same shape existing components already
// consume.
// =============================================================================

import hutSvg from '$icons/hut.svg?raw';
import farmerSvg from '$icons/farmer.svg?raw';
import locationSvg from '$icons/location.svg?raw';
import treasureMapSvg from '$icons/treasure-map.svg?raw';
import dungeonGateSvg from '$icons/dungeon-gate.svg?raw';

/** All first-class entity kinds users can create or link. Order = the
 *  canonical order the rails render / pickers list. */
export const ENTITY_KIND_LIST = ['community', 'place', 'npc', 'journey', 'site'] as const;
export type EntityKind = (typeof ENTITY_KIND_LIST)[number];

export interface EntityKindMeta {
	/** Accent colour shown as the row's left band + kind-badge tint.
	 *  Chosen so each kind is distinguishable at a glance in a mixed
	 *  list without clashing against the parchment background. */
	color: string;
	/** Inline SVG markup for the kind's glyph. Consumers render with
	 *  `{@html icon}` and colour via `fill: currentColor`. */
	icon: string;
	/** User-facing singular label (title case). */
	label: string;
	/** User-facing plural label (title case) — used by filter chips
	 *  and by empty-state text like "No communities match…". */
	labelPlural: string;
}

/** Single source of truth for kind colour + icon + label triples.
 *  Consumers should import this instead of redeclaring their own
 *  constants — otherwise the two shades of steel blue we had for
 *  Place before this file come back. */
export const ENTITY_KIND_META: Record<EntityKind, EntityKindMeta> = {
	community: {
		color: '#D06840',
		icon: hutSvg,
		label: 'Community',
		labelPlural: 'Communities',
	},
	place: {
		color: '#4AA0C8',
		icon: locationSvg,
		label: 'Place',
		labelPlural: 'Places',
	},
	npc: {
		color: '#C848A8',
		icon: farmerSvg,
		label: 'NPC',
		labelPlural: 'NPCs',
	},
	journey: {
		color: '#E4AA28',
		icon: treasureMapSvg,
		label: 'Journey',
		labelPlural: 'Journeys',
	},
	site: {
		color: '#4472D0',
		icon: dungeonGateSvg,
		label: 'Site',
		labelPlural: 'Sites',
	},
};

/** Convenience helpers — read the field for one kind without spelling
 *  out `ENTITY_KIND_META[kind].xxx` at every call site. Return the
 *  metadata for a fallback kind when passed something invalid so
 *  broken data never crashes the render. */
export function kindColor(kind: EntityKind): string {
	return ENTITY_KIND_META[kind]?.color ?? ENTITY_KIND_META.community.color;
}
export function kindIcon(kind: EntityKind): string {
	return ENTITY_KIND_META[kind]?.icon ?? ENTITY_KIND_META.community.icon;
}
export function kindLabel(kind: EntityKind): string {
	return ENTITY_KIND_META[kind]?.label ?? kind;
}
export function kindLabelPlural(kind: EntityKind): string {
	return ENTITY_KIND_META[kind]?.labelPlural ?? kind;
}
