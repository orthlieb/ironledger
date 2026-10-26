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
// Icons are raw SVG markup for `{@html …}` inlining — the active livery's
// where it ships one, else the app's own (liveryIcons.ts).
// =============================================================================

import { appIcon } from './liveryIcons.js';

/** All first-class entity kinds users can create or link. Order = the
 *  canonical order the rails render / pickers list. */
export const ENTITY_KIND_LIST = ['community', 'place', 'npc', 'journey', 'site', 'scene'] as const;
export type EntityKind = (typeof ENTITY_KIND_LIST)[number];

export interface EntityKindMeta {
	/** Accent colour shown as the row's left band + kind-badge tint.
	 *  Chosen so each kind is distinguishable at a glance in a mixed
	 *  list without clashing against the parchment background. */
	color: string;
	/** Inline SVG markup for the kind's glyph. Consumers render with
	 *  `{@html icon}` and colour via `fill: currentColor`. The active
	 *  livery's, where it ships one (liveryIcons.ts): read it in a template
	 *  or `$derived`, not into a plain constant, so it follows a livery
	 *  change. */
	readonly icon: string;
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
		get icon() {
			return appIcon('settlements');
		},
		// User-facing label is "Settlement" (canon); the internal kind id stays
		// `community` (DB kind value, /communities API route, communityStore) to
		// avoid a data migration — that identifier is never shown to users.
		label: 'Settlement',
		labelPlural: 'Settlements',
	},
	place: {
		// `kind` stays 'place' everywhere (DB, API, marker links, exports);
		// only the user-facing label reads "Landmark" — its canon name.
		color: '#4AA0C8',
		get icon() {
			return appIcon('landmarks');
		},
		label: 'Landmark',
		labelPlural: 'Landmarks',
	},
	npc: {
		color: '#C848A8',
		get icon() {
			return appIcon('npcs');
		},
		label: 'NPC',
		labelPlural: 'NPCs',
	},
	journey: {
		color: '#E4AA28',
		get icon() {
			return appIcon('journey');
		},
		label: 'Journey',
		labelPlural: 'Journeys',
	},
	site: {
		color: '#4472D0',
		get icon() {
			return appIcon('site');
		},
		label: 'Site',
		labelPlural: 'Sites',
	},
	scene: {
		color: '#7E57C2',
		get icon() {
			return appIcon('scene');
		},
		label: 'Scene',
		labelPlural: 'Scenes',
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
