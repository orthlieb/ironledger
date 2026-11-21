// =============================================================================
// Iron Ledger — the content packs a backup records
//
// A Zip export lists every toggleable content pack with whether it was on
// (`extensions` in everything.json). A restore switches on the ones that
// were on, never switches one off, and names any it can't find here: what
// the backup holds from that pack still imports. The store side is
// expansionStore.svelte.ts (packChoices, enableExtensions).
// =============================================================================

/** A pack's state as a backup records it. */
export interface PackChoice {
	id: string;
	name: string;
	enabled: boolean;
}

/** An extension id the account's choices take (see the API's PATCH schema). */
const PACK_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** A backup's `extensions` list, keeping only well-formed rows. `base` is
 *  core and always on, so it's never listed. A name that's missing or blank
 *  falls back to the id. */
export function readPackChoices(raw: unknown): PackChoice[] {
	if (!Array.isArray(raw)) return [];
	const seen = new Set<string>();
	const out: PackChoice[] = [];
	for (const r of raw) {
		if (!r || typeof r !== 'object') continue;
		const { id, name, enabled } = r as Record<string, unknown>;
		if (typeof id !== 'string' || !PACK_ID.test(id) || id === 'base' || seen.has(id)) continue;
		if (typeof enabled !== 'boolean') continue;
		seen.add(id);
		const label = typeof name === 'string' ? name.trim().slice(0, 80) : '';
		out.push({ id, name: label || id, enabled });
	}
	return out;
}

/** What restoring a backup's packs does here: the ids to switch on (on in
 *  the backup, and here), and the packs that were on but aren't here. */
export function planPackRestore(
	incoming: PackChoice[],
	hereIds: Iterable<string>,
): { switchOn: string[]; missing: PackChoice[] } {
	const here = new Set(hereIds);
	const on = incoming.filter((p) => p.enabled);
	return {
		switchOn: on.filter((p) => here.has(p.id)).map((p) => p.id),
		missing: on.filter((p) => !here.has(p.id)),
	};
}
