/**
 * What the Connections area (CommunitiesArea) and its tab components share:
 * the three kinds of entry, a Within picker option, and the Lodestar
 * settlement fields.
 */

/** A connection: a settlement (`community`), an NPC, or a landmark (`place`). */
export type EntryKind = 'community' | 'npc' | 'place';

/** One option in the Within picker: a settlement or landmark to sit inside,
 *  by its `kind:id` ref, with its kind's glyph and colour. */
export interface WithinItem {
	ref: string;
	label: string;
	kind: EntryKind;
	icon: string;
	color: string;
}

/** Lodestar's settlement suite: shown on a settlement only under Lodestar (or
 *  when it already has a value). Type / Condition / First Look are the book's
 *  "on reveal" set (rolled on Create by default); Disposition / Projects /
 *  Cultural Touchstones are situational. */
export const LODESTAR_SETTLEMENT_FIELDS = [
	{ key: 'type', label: 'Type' },
	{ key: 'condition', label: 'Condition' },
	{ key: 'firstLook', label: 'First Look' },
	{ key: 'disposition', label: 'Disposition' },
	{ key: 'projects', label: 'Projects' },
	{ key: 'culturalTouchstones', label: 'Cultural Touchstones' },
] as const;
export type LodestarSettlementFieldKey = (typeof LODESTAR_SETTLEMENT_FIELDS)[number]['key'];
