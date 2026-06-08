// =============================================================================
// Iron Ledger — Session Store (Svelte 5 module-level $state)
//
// Persists the user's active selections (character, foe, expedition) to the
// server so the UI restores correctly across devices and after logout.
// Initiative is stored on each character's data and is no longer held here.
//
// Provides:
//   • loadSessionState()    — fetch saved state on page load, returns it
//   • saveSessionState(s)   — debounced PATCH on every selection change
// =============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionState {
	charId: string;
	foeId: string;
	expeditionId: string;
	activeTab: string;
}

export const DEFAULT_SESSION_STATE: SessionState = {
	charId: '',
	foeId: '',
	expeditionId: '',
	activeTab: '',
};

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/** Set to true once loadSessionState() completes — prevents saving stale
 *  empty values before the initial load has returned from the server. */
let _loaded = false;

let _saveTimer: ReturnType<typeof setTimeout> | null = null;

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

/**
 * Fetch the user's saved session state from the server.
 * Call this on page mount after characters, encounters, and expeditions have
 * loaded so the ID validation checks have data to work against.
 */
export async function loadSessionState(): Promise<SessionState> {
	try {
		const res = await fetch('/api/session', { credentials: 'include' });
		if (!res.ok) throw new Error(`Session fetch failed: ${res.status}`);
		const json = (await res.json()) as { sessionState?: SessionState };
		_loaded = true;
		return { ...DEFAULT_SESSION_STATE, ...(json.sessionState ?? {}) };
	} catch (err) {
		console.error('[sessionStore] Failed to load session state:', err);
		_loaded = true; // allow saves to proceed even if load failed
		return { ...DEFAULT_SESSION_STATE };
	}
}

// ---------------------------------------------------------------------------
// Save (debounced)
// ---------------------------------------------------------------------------

/**
 * Persist the current session state. Debounced at 1500 ms — rapid selection
 * changes only result in one server write.
 * No-ops until loadSessionState() has completed to avoid overwriting the DB
 * with empty values on initial mount.
 */
export function saveSessionState(state: SessionState): void {
	if (!_loaded) return;
	if (_saveTimer) clearTimeout(_saveTimer);
	_saveTimer = setTimeout(async () => {
		try {
			const res = await fetch('/api/session/state', {
				method: 'PATCH',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sessionState: state }),
			});
			if (!res.ok) {
				console.error('[sessionStore] Save failed:', res.status);
			}
		} catch (err) {
			console.error('[sessionStore] Save error:', err);
		}
	}, 1500);
}
