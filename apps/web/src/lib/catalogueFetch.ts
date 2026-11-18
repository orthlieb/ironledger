// =============================================================================
// Iron Ledger — fetch a catalogue (moves, oracles, assets, foes, delve,
// cultures, the extension list)
//
// Every catalogue store fetches through this. `cache: 'no-cache'` makes the
// browser check with the server before using a copy it holds (a 304 when
// nothing changed), even one it was told it could keep for an hour. Content
// changes shape with a deploy, and new code reading an old copy breaks: the
// extension list from before fields were renamed left the sheet's Details tab
// blank. The API sends `Cache-Control: no-cache` too (routes/catalogue.ts).
// =============================================================================

/** Fetch `/api/catalogue…`, revalidating any cached copy. */
export function fetchCatalogue(path: `/api/catalogue${string}`): Promise<Response> {
	return fetch(path, { cache: 'no-cache' });
}
