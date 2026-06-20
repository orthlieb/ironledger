// =============================================================================
// Iron Ledger — shared GET /api/session fetcher
//
// The four session-collection stores (encounter, expedition, community, npc)
// each load on mount and each used to `fetch('/api/session')` independently —
// so the same full payload (every collection, every inlined portrait) was
// transferred and JSON-parsed N times per page load.
//
// fetchSession() coalesces those concurrent calls into ONE request: the first
// caller kicks off the fetch, the rest await the same in-flight promise. The
// cache is the in-flight promise only — it clears once settled, so a later load
// (e.g. after a fresh navigation) fetches current data rather than a stale copy.
// =============================================================================

export interface SessionPayload {
	encounters?: unknown;
	expeditions?: unknown;
	communities?: unknown;
	npcs?: unknown;
	sessionState?: unknown;
}

let _inflight: Promise<SessionPayload> | null = null;

/** Fetch the user's full session payload, sharing one request across all
 *  concurrent callers. Throws on a non-OK response (callers handle it). */
export function fetchSession(): Promise<SessionPayload> {
	if (_inflight) return _inflight;
	_inflight = (async () => {
		try {
			const res = await fetch('/api/session', { credentials: 'include' });
			if (!res.ok) throw new Error(`Session fetch failed: ${res.status}`);
			return (await res.json()) as SessionPayload;
		} finally {
			// Clear once settled so the next (non-concurrent) load refetches fresh.
			_inflight = null;
		}
	})();
	return _inflight;
}
