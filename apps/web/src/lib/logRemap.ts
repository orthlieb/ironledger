// =============================================================================
// Iron Ledger — re-pointing an imported log at the rows as they landed
//
// A log entry names the rows it was rolled with by id: the character, foe and
// expedition in its roll data (Burn momentum reads them), and the same ids on
// its links (`data-char-id` on "+1 failure", `data-foe-id` on a foe's
// progress, `data-exp-id` / `data-expedition-id` on a journey's or site's),
// plus its own id on each link (`data-entry-id`, `data-roll-entry-id`), and
// the binding its roll keeps for a burn (`roll.bind`).
// Import gives some rows new ids (a character always gets one), so it records
// old → new per kind as rows land and runs the log through here before it
// goes up. An id with nothing recorded is left as it is.
// =============================================================================

/** Old id → new id, per kind of row an entry can name. */
export interface LogIdMaps {
	char?: ReadonlyMap<string, string>;
	foe?: ReadonlyMap<string, string>;
	exp?: ReadonlyMap<string, string>;
	/** Log entries whose id was replaced (it wasn't one the log takes). */
	entry?: ReadonlyMap<string, string>;
}

/** Which map each id-carrying link attribute reads. */
const ATTR_KIND: Record<string, keyof LogIdMaps> = {
	'data-char-id': 'char',
	'data-foe-id': 'foe',
	'data-exp-id': 'exp',
	'data-expedition-id': 'exp',
	'data-entry-id': 'entry',
	'data-roll-entry-id': 'entry',
};

const ATTR_RE = /\b(data-(?:char|foe|exp|expedition|entry|roll-entry)-id)="([^"]*)"/g;

interface RemappableEntry {
	html: string;
	roll?: {
		charId?: string;
		foeId?: string;
		expeditionId?: string;
		bind?: { charId?: string; foeId?: string; expId?: string; rollId?: string };
	} | null;
}

/** One entry with every id it names re-pointed through `maps`. */
export function remapLogEntry<T extends RemappableEntry>(entry: T, maps: LogIdMaps): T {
	const to = (kind: keyof LogIdMaps, id: string) => maps[kind]?.get(id) ?? id;
	const html = entry.html.replace(
		ATTR_RE,
		(_, attr: string, id: string) => `${attr}="${to(ATTR_KIND[attr]!, id)}"`,
	);
	const out = { ...entry, html };
	const r = entry.roll;
	if (r && typeof r === 'object') {
		out.roll = {
			...r,
			...(typeof r.charId === 'string' ? { charId: to('char', r.charId) } : {}),
			...(typeof r.foeId === 'string' ? { foeId: to('foe', r.foeId) } : {}),
			...(typeof r.expeditionId === 'string' ? { expeditionId: to('exp', r.expeditionId) } : {}),
		};
		const b = r.bind;
		if (b && typeof b === 'object')
			out.roll.bind = {
				...b,
				...(typeof b.charId === 'string' ? { charId: to('char', b.charId) } : {}),
				...(typeof b.foeId === 'string' ? { foeId: to('foe', b.foeId) } : {}),
				...(typeof b.expId === 'string' ? { expId: to('exp', b.expId) } : {}),
				...(typeof b.rollId === 'string' ? { rollId: to('entry', b.rollId) } : {}),
			};
	}
	return out;
}

/** Every entry re-pointed; the same array back when nothing was recorded. */
export function remapLogEntries<T extends RemappableEntry>(entries: T[], maps: LogIdMaps): T[] {
	const any = Object.values(maps).some((m) => m && m.size > 0);
	return any ? entries.map((e) => remapLogEntry(e, maps)) : entries;
}
