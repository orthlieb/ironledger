// =============================================================================
// Iron Ledger — AI story section markers (Svelte 5 module-level $state)
//
// Replaces the earlier `storyRecorder` state machine. Two markers pinned to
// log-entry ids define the section that a Generate Story request will consume:
//
//   • startId  — the OLDEST entry included (index-position in the log is
//                large, because the log is stored newest-first).
//   • endId    — the NEWEST entry included; null means "top of log, live".
//
// Section semantics:
//   • startId=null            → no section, nothing to generate.
//   • startId set, endId=null → open section that grows as new entries land.
//                               This is the "record forward" behavior of the
//                               old storyRecorder, without the mode state.
//   • startId & endId both    → fixed range between the two ids (inclusive).
//
// Persisted in localStorage so a reload keeps an open selection.
// =============================================================================

import type { LogEntry } from './log.svelte.js';
import { sessionLog } from './log.svelte.js';

const SECTION_STORAGE = 'ironledger:ai:section';

interface SectionState {
	startId: string | null;
	endId: string | null;
}

function readSection(): SectionState {
	if (typeof window === 'undefined') return { startId: null, endId: null };
	try {
		const raw = localStorage.getItem(SECTION_STORAGE);
		if (!raw) return { startId: null, endId: null };
		const p = JSON.parse(raw) as Partial<SectionState>;
		return {
			startId: typeof p.startId === 'string' ? p.startId : null,
			endId: typeof p.endId === 'string' ? p.endId : null,
		};
	} catch {
		return { startId: null, endId: null };
	}
}

function persist(): void {
	if (typeof window === 'undefined') return;
	if (_startId === null && _endId === null) {
		localStorage.removeItem(SECTION_STORAGE);
	} else {
		localStorage.setItem(SECTION_STORAGE, JSON.stringify({ startId: _startId, endId: _endId }));
	}
}

const _initial = readSection();
let _startId = $state<string | null>(_initial.startId);
let _endId = $state<string | null>(_initial.endId);

// ---------------------------------------------------------------------------
// Reactive readers
// ---------------------------------------------------------------------------

export function getStartId(): string | null {
	return _startId;
}
export function getEndId(): string | null {
	return _endId;
}
export function hasSection(): boolean {
	return _startId !== null;
}

/**
 * The entries in the current section, in the same newest-first order as
 * `sessionLog.entries`. Empty array when there's no start marker or when
 * the start marker points at an entry that's no longer in the log (e.g.
 * cleared). Follows the log reactively.
 */
export function sectionEntries(): LogEntry[] {
	if (_startId === null) return [];
	const entries = sessionLog.entries;
	const startIdx = entries.findIndex((e) => e.id === _startId);
	if (startIdx < 0) return [];
	// endId=null → open selection reaching the current top of log (index 0).
	// endId set → find its position; degrade to top if it's not in the log.
	let endIdx = 0;
	if (_endId !== null) {
		const found = entries.findIndex((e) => e.id === _endId);
		if (found >= 0) endIdx = found;
	}
	// endIdx should be <= startIdx (newer entries have smaller indices).
	// If someone somehow set end older than start, swap so we still get a
	// well-formed slice rather than an empty one.
	const lo = Math.min(startIdx, endIdx);
	const hi = Math.max(startIdx, endIdx);
	return entries.slice(lo, hi + 1);
}

export function sectionCount(): number {
	return sectionEntries().length;
}

/** True when the entry is inside the current section — used for CSS highlight. */
export function isEntryInSection(entryId: string): boolean {
	if (_startId === null) return false;
	if (entryId === _startId) return true;
	const entries = sessionLog.entries;
	const startIdx = entries.findIndex((e) => e.id === _startId);
	if (startIdx < 0) return false;
	const target = entries.findIndex((e) => e.id === entryId);
	if (target < 0) return false;
	let endIdx = 0;
	if (_endId !== null) {
		const found = entries.findIndex((e) => e.id === _endId);
		if (found >= 0) endIdx = found;
	}
	const lo = Math.min(startIdx, endIdx);
	const hi = Math.max(startIdx, endIdx);
	return target >= lo && target <= hi;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Set the start marker. Clears the end marker if it now precedes the new start. */
export function setStart(entryId: string | null): void {
	_startId = entryId;
	// If we set a new start, drop the old end — the user can re-pick.
	if (entryId !== null) _endId = null;
	persist();
}

/** Set the end marker. No-op when there's no start yet. */
export function setEnd(entryId: string | null): void {
	if (_startId === null && entryId !== null) return;
	_endId = entryId;
	persist();
}

/** Toggle a marker on a specific entry: sets it, or clears it if already set. */
export function toggleStart(entryId: string): void {
	setStart(_startId === entryId ? null : entryId);
}
export function toggleEnd(entryId: string): void {
	if (_startId === null) return;
	setEnd(_endId === entryId ? null : entryId);
}

/** Drop both markers — no section. */
export function clearSection(): void {
	_startId = null;
	_endId = null;
	persist();
}

/**
 * Clear only the end marker while keeping start. Called after a successful
 * Save to Log so the "continue" behavior is free: the section immediately
 * re-extends to the current top of log for the next generation.
 */
export function clearEnd(): void {
	_endId = null;
	persist();
}
