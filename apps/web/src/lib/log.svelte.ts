// =============================================================================
// Iron Ledger — Session Log Store (Svelte 5 module-level $state)
// Stores log entries per-character in localStorage, keyed as `il-log:{charId}`.
// Maximum 500 entries per character (oldest are dropped first).
// =============================================================================

export interface LogEntry {
	id:    string;
	title: string;
	html:  string;
	ts:    string;
	note?: string; // user-authored note attached to this entry
}

const storageKey = (charId: string) => `il-log:${charId}`;

// Module-level reactive state: map of charId → entries (newest first)
// Exported directly so components can access logs[charId] inside $derived
// for explicit Svelte 5 proxy tracking (rather than wrapping in getLog()).
export let logs = $state<Record<string, LogEntry[]>>({});

/** Persist the current entries for a character to localStorage. */
function persist(charId: string): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.setItem(storageKey(charId), JSON.stringify(logs[charId] ?? []));
	} catch {
		// Storage quota exceeded — swallow silently
	}
}

/** Load stored entries for a character (idempotent — safe to call multiple times). */
export function initLog(charId: string): void {
	if (typeof window === 'undefined') return;
	if (logs[charId] !== undefined) return; // already loaded
	try {
		const raw = localStorage.getItem(storageKey(charId));
		logs[charId] = raw ? (JSON.parse(raw) as LogEntry[]) : [];
	} catch {
		logs[charId] = [];
	}
}

/** Reactive getter — call inside $derived or template to get live entries. */
export function getLog(charId: string): LogEntry[] {
	return logs[charId] ?? [];
}

/** Append a new entry and persist to localStorage. */
export function appendLog(charId: string, title: string, html: string): void {
	if (typeof window === 'undefined') return;
	initLog(charId);
	const entry: LogEntry = {
		id:   crypto.randomUUID(),
		title,
		html,
		ts:   new Date().toISOString(),
	};
	// Prepend (newest first), cap at 500 entries
	logs[charId] = [entry, ...(logs[charId] ?? [])].slice(0, 500);
	persist(charId);
}

/** Remove a single entry by id. */
export function deleteLogEntry(charId: string, entryId: string): void {
	if (!logs[charId]) return;
	logs[charId] = logs[charId].filter((e) => e.id !== entryId);
	persist(charId);
}

/** Set or clear the user note on a single entry. */
export function updateLogEntryNote(charId: string, entryId: string, note: string): void {
	if (!logs[charId]) return;
	logs[charId] = logs[charId].map((e) =>
		e.id === entryId ? { ...e, note: note.trim() || undefined } : e,
	);
	persist(charId);
}

/** Wipe all entries for a character from state and storage. */
export function clearLog(charId: string): void {
	logs[charId] = [];
	if (typeof window === 'undefined') return;
	try {
		localStorage.removeItem(storageKey(charId));
	} catch {
		// ignore
	}
}
