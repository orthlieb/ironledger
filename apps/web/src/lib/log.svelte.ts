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

import type { LinkBinding } from '#lib/commands/links.js';

/** Metadata for action rolls — enables burn-momentum after the fact. */
export interface RollMeta {
	moveId: string; // to look up outcome HTML from move definition
	actionScore: number; // total (die + stat + adds)
	c1: number; // challenge die 1
	c2: number; // challenge die 2
	charId: string; // character who rolled
	/** The stat rolled (`edge`, `iron`, …), so a burn's new outcome is built
	 *  as the roll's was: Delve the Depths' oracle opens on its column. */
	stat?: string;
	/** Active foe encounter id — set on moves whose title references {foe} (combat).
	 *  Lets the story preface scan match foes exactly instead of by name. */
	foeId?: string;
	/** Active expedition id — set on moves whose title references {expedition}. */
	expeditionId?: string;
	/** What the roll's links were bound to (foe, expedition, vow, companion,
	 *  harm), so a burn's new outcome binds its links the same way. */
	bind?: LinkBinding;
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

	// Optimistic: prepend immediately; rolling cap matches the server's
	sessionLog.entries = [entry, ...sessionLog.entries].slice(0, LOG_CAP);

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
// The whole log, for an export; many entries at once, for an import
// ---------------------------------------------------------------------------

/** The most entries the server keeps, and the most one request returns. */
export const LOG_CAP = 1000;

/** Every entry the server keeps, newest first — more than the page loads
 *  (its newest 200). Null if it can't be read. */
export async function fetchWholeLog(): Promise<LogEntry[] | null> {
	try {
		const res = await apiGet(`?limit=${LOG_CAP}`);
		if (!res.ok) return null;
		const rows = (await res.json()) as unknown;
		return Array.isArray(rows) ? (rows as LogEntry[]) : null;
	} catch {
		return null;
	}
}

/** The batches an import's entries go up in: the API takes 2 MB a request. */
const BATCH_BYTES = 1_500_000;
const BATCH_ENTRIES = 250;

/**
 * Add a backup's entries to the log as they were — each with its own id,
 * time, note and roll — and show them in their places. An id already in the
 * log is left as it is (server and here), so importing the same backup
 * twice adds nothing; the log keeps its newest LOG_CAP either way. Throws if
 * a batch is refused, having added the batches before it.
 */
export async function importLogEntries(entries: LogEntry[]): Promise<void> {
	if (entries.length === 0) return;
	let batch: LogEntry[] = [];
	let bytes = 0;
	const send = async () => {
		if (batch.length === 0) return;
		const res = await fetch('/api/session/log/batch', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ entries: batch }),
		});
		if (!res.ok) throw new Error(`the log couldn't be saved (${res.status})`);
		const have = new Set(sessionLog.entries.map((e) => e.id));
		const added = batch.filter((e) => !have.has(e.id));
		sessionLog.entries = [...sessionLog.entries, ...added]
			.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
			.slice(0, LOG_CAP);
		batch = [];
		bytes = 0;
	};
	for (const e of entries) {
		const size = JSON.stringify(e).length;
		if (batch.length >= BATCH_ENTRIES || (batch.length > 0 && bytes + size > BATCH_BYTES))
			await send();
		batch.push(e);
		bytes += size;
	}
	await send();
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
// bindCommandLinks
// ---------------------------------------------------------------------------

/** Bind an entry's command links to it: see #lib/commands/links.ts. */
export { bindCommandLinks } from '#lib/commands/links.js';

// ---------------------------------------------------------------------------
// clearLog — optimistic + DELETE all
// ---------------------------------------------------------------------------

/** Wipe all entries from state and server. */
export function clearLog(): void {
	sessionLog.entries = [];
	apiDeleteAll().catch(() => {});
}

// ---------------------------------------------------------------------------
// Generalized Action Bus (resource changes, debility toggles)
// ---------------------------------------------------------------------------
// The Moves dialog (Endure Harm's Apply) and LogPanel (a burn's momentum
// reset) call triggerAction(); CharactersArea's $effect drains and applies
// the change inside Svelte's reactive context. Log links are commands now
// (#lib/commands/), which write values themselves.

export interface LogAction {
	charId: string;
	type: 'resource' | 'debility' | 'reset-track' | 'set' | 'initiative';
	/** Resource name, debility name, track name; unused for `initiative`. */
	key: string;
	/** Delta for `resource`, 0/1 for `debility`, ignored for `reset-track`,
	 *  absolute value for `set`, 0|1|2 (none|character|foe) for `initiative`. */
	value: number;
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
