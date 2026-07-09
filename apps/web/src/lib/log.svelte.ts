// =============================================================================
// Iron Ledger — Session Log Store (Svelte 5 module-level $state)
//
// One DB row per log entry (JSONB). Local state is the source of truth for
// rendering; API calls are fire-and-forget (optimistic). On init the latest
// 200 entries are fetched from the server.
//
// The log is global (one per session), not per-character. Components read the
// reactive `sessionLog.entries` array directly so Svelte 5's proxy records a
// fine-grained dependency on it.
// =============================================================================

/** Metadata for action rolls — enables burn-momentum after the fact. */
export interface RollMeta {
	moveId: string; // to look up outcome HTML from move definition
	actionScore: number; // total (die + stat + adds)
	c1: number; // challenge die 1
	c2: number; // challenge die 2
	charId: string; // character who rolled
	/** Active foe encounter id — set on moves whose title references {foe} (combat).
	 *  Lets the story preface scan match foes exactly instead of by name. */
	foeId?: string;
	/** Active expedition id — set on moves whose title references {expedition}. */
	expeditionId?: string;
}

export interface LogEntry {
	id: string;
	title: string;
	html: string;
	ts: string;
	note?: string; // user-authored note attached to this entry
	source?: string; // original markdown source (for editable entries like Notes)
	roll?: RollMeta; // present only on action roll entries (enables burn momentum)
}

// Module-level reactive state: the single global session log (newest first).
// Exported as an object wrapper so the `.entries` reassignment stays reactive
// and components can read `sessionLog.entries` inside $derived for
// fine-grained Svelte 5 proxy tracking.
export const sessionLog = $state<{ entries: LogEntry[] }>({ entries: [] });

// Whether the initial fetch has already fired (initLog is idempotent).
let _initialised = false;

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function apiGet(path: string): Promise<Response> {
	return fetch(`/api/session/log${path}`);
}

async function apiPost(entry: LogEntry): Promise<void> {
	await fetch('/api/session/log', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(entry),
	});
}

async function apiPatch(entryId: string, patch: Partial<LogEntry>): Promise<void> {
	await fetch(`/api/session/log/${entryId}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(patch),
	});
}

async function apiDelete(entryId: string): Promise<void> {
	await fetch(`/api/session/log/${entryId}`, { method: 'DELETE' });
}

async function apiDeleteAll(): Promise<void> {
	await fetch('/api/session/log', { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// initLog — load the latest entries from the server (idempotent)
// ---------------------------------------------------------------------------

/** Load stored entries from the server (idempotent — safe to call multiple times). */
export function initLog(): void {
	if (typeof window === 'undefined') return;
	if (_initialised) return;
	_initialised = true;

	// Fetch latest 200 entries in the background; state updates reactively.
	apiGet('?limit=200')
		.then(async (res) => {
			if (!res.ok) return; // server error — keep the empty array
			sessionLog.entries = await res.json();
		})
		.catch(() => {
			// Network error — keep the empty array, log will be blank until reload
		});
}

// ---------------------------------------------------------------------------
// appendLog — optimistic prepend + fire-and-forget POST
// ---------------------------------------------------------------------------

/** Append a new entry. Accepts an optional pre-generated id, source markdown, and roll metadata. */
export function appendLog(
	title: string,
	html: string,
	id?: string,
	source?: string,
	roll?: RollMeta,
): void {
	if (typeof window === 'undefined') return;
	initLog();

	const entry: LogEntry = {
		id: id ?? crypto.randomUUID(),
		title,
		html,
		ts: new Date().toISOString(),
		...(source ? { source } : {}),
		...(roll ? { roll } : {}),
	};

	// Optimistic: prepend immediately; rolling cap matches server-side 1000
	sessionLog.entries = [entry, ...sessionLog.entries].slice(0, 1000);

	// Persist to server in background
	apiPost(entry).catch(() => {
		/* swallow — optimistic state already shown */
	});
}

// ---------------------------------------------------------------------------
// updateLogEntryHtml — optimistic local update + PATCH
// ---------------------------------------------------------------------------

/** Replace the HTML body of an existing log entry. Optionally update source markdown.
 *  Pass clearRoll to remove roll metadata (prevents double-burn). */
export function updateLogEntryHtml(
	entryId: string,
	html: string,
	source?: string,
	clearRoll?: boolean,
): void {
	const patch: Partial<LogEntry> = { html, ...(source !== undefined ? { source } : {}) };

	sessionLog.entries = sessionLog.entries.map((e) => {
		if (e.id !== entryId) return e;
		const updated = { ...e, ...patch };
		if (clearRoll) delete updated.roll;
		return updated;
	});

	apiPatch(entryId, patch).catch(() => {});
}

// ---------------------------------------------------------------------------
// deleteLogEntry — optimistic removal + DELETE
// ---------------------------------------------------------------------------

/** Remove a single entry by id. */
export function deleteLogEntry(entryId: string): void {
	sessionLog.entries = sessionLog.entries.filter((e) => e.id !== entryId);
	apiDelete(entryId).catch(() => {});
}

// ---------------------------------------------------------------------------
// getLog — read-only accessor
// ---------------------------------------------------------------------------

/** Return the current entries array for the session log (read-only intent). */
export function getLog(): LogEntry[] {
	return sessionLog.entries;
}

// ---------------------------------------------------------------------------
// updateLogEntryNote — optimistic + PATCH
// ---------------------------------------------------------------------------

/** Set or clear the user note on a single entry. */
export function updateLogEntryNote(entryId: string, note: string): void {
	const trimmed = note.trim();
	const patch: Partial<LogEntry> = { note: trimmed || undefined };

	sessionLog.entries = sessionLog.entries.map((e) =>
		e.id === entryId ? { ...e, note: trimmed || undefined } : e,
	);

	apiPatch(entryId, patch).catch(() => {});
}

// ---------------------------------------------------------------------------
// enrichOutcomeLinks
// ---------------------------------------------------------------------------

/**
 * Enrich outcome HTML with entry-id and char-id on interactive links
 * so LogPanel click delegation can identify the entry and character.
 */
export function enrichOutcomeLinks(html: string, entryId: string, charId: string): string {
	return html.replace(
		/<a\s+class="(resource-link|debility-link|progress-link|initiative-link|menace-link|vanquish-foe-link|reset-track-link)"/g,
		`<a data-entry-id="${entryId}" data-char-id="${charId}" class="$1"`,
	);
}

// ---------------------------------------------------------------------------
// clearLog — optimistic + DELETE all
// ---------------------------------------------------------------------------

/** Wipe all entries from state and server. */
export function clearLog(): void {
	sessionLog.entries = [];
	apiDeleteAll().catch(() => {});
}

// ---------------------------------------------------------------------------
// XP Spend Bus
// ---------------------------------------------------------------------------
// LogPanel calls triggerXpSpend() when the user clicks an XP cost link.
// CharacterSheet has a $effect that reads getXpSpendNonce() to subscribe
// reactively, then calls drainXpSpend() to consume pending amounts.
//
// This avoids two failure modes of the previous Map-based approach:
//   1. Handler lost when CharacterSheet unmounts (tab change) — items remain
//      in the queue until the component re-mounts and drains them.
//   2. $state mutation from a plain Map callback (outside Svelte's reactive
//      context) not propagating through bind:value — here the mutation
//      happens inside the $effect, which IS Svelte's reactive context.

let _xpSpendNonce = $state(0);
const _xpSpendQueue: Array<{ charId: string; amount: number }> = [];

/** Read inside $effect to subscribe to XP spend events (reactive signal). */
export function getXpSpendNonce(): number {
	return _xpSpendNonce;
}

/** Queue an XP spend and signal all watching $effects. Called by LogPanel. */
export function triggerXpSpend(charId: string, amount: number): void {
	_xpSpendQueue.push({ charId, amount });
	_xpSpendNonce++;
}

/**
 * Drain all queued XP spend amounts for a character and return the total.
 * Call this inside the $effect that reads getXpSpendNonce().
 */
export function drainXpSpend(charId: string): number {
	let total = 0;
	let i = _xpSpendQueue.length;
	while (i--) {
		const item = _xpSpendQueue[i];
		if (item.charId === charId) {
			total += item.amount;
			_xpSpendQueue.splice(i, 1);
		}
	}
	return total;
}

// ---------------------------------------------------------------------------
// Generalized Action Bus (resource changes, debility toggles)
// ---------------------------------------------------------------------------
// Same pattern as XP Spend Bus. LogPanel calls triggerAction() when the user
// clicks a resource-link or debility-link. CharacterSheet $effect drains and
// applies the mutation inside Svelte's reactive context.

export interface LogAction {
	charId: string;
	type: 'resource' | 'debility' | 'reset-track' | 'set';
	key: string; // resource name, debility name, or track name
	value: number; // delta for resource, 0/1 for debility, ignored for reset-track
}

let _actionNonce = $state(0);
const _actionQueue: LogAction[] = [];

/** Read inside $effect to subscribe to action events (reactive signal). */
export function getActionNonce(): number {
	return _actionNonce;
}

/** Queue a character-level action and signal all watching $effects. */
export function triggerAction(action: LogAction): void {
	_actionQueue.push(action);
	_actionNonce++;
}

/** Drain all queued actions for a character. Call inside $effect reading getActionNonce(). */
export function drainActions(charId: string): LogAction[] {
	const result: LogAction[] = [];
	let i = _actionQueue.length;
	while (i--) {
		if (_actionQueue[i].charId === charId) {
			result.push(_actionQueue[i]);
			_actionQueue.splice(i, 1);
		}
	}
	return result;
}
