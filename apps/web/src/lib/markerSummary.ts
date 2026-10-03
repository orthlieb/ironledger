// =============================================================================
// Iron Ledger — what the map's marker card says about a marker.
//
// Nothing is generated: the card shows the marker's title and kind, and the
// linked Connection's Summary exactly as written. An unlinked
// marker gets its label and its icon's name, nothing more.
// =============================================================================

import type { MapMarker } from './mapStore.svelte.js';
import type { MapIcon } from './generated/mapIconManifest.js';
import { ENTITY_KIND_META } from './entityKinds.js';
import { resolveEntityData, type LinkedEntityData } from './mapEntityLinks.js';

export interface MarkerSummary {
	title: string;
	/** Kind line under the title, e.g. "Settlement", or the icon's name. */
	subtitle: string;
	/** Accent for the kind line (the linked kind's colour). */
	color?: string;
	/** The linked Connection's Summary (markdown), if any. */
	summary?: string;
	/** The linked entity, when the marker has a resolvable link. */
	linked: LinkedEntityData | null;
}

/** Everything the marker card shows for one marker. */
export function markerSummary(m: MapMarker, icon: MapIcon | undefined): MarkerSummary {
	const linked = resolveEntityData(m.entityId);
	if (linked) {
		const meta = ENTITY_KIND_META[linked.kind];
		return {
			title: linked.data.name || m.label || meta.label,
			subtitle: meta.label,
			color: meta.color,
			summary: linked.data.shortDescription?.trim() || undefined,
			linked,
		};
	}
	return {
		title: m.label || icon?.label || 'Marker',
		subtitle: icon?.label ?? 'Label',
		linked: null,
	};
}
