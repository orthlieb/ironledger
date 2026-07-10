// =============================================================================
// Iron Ledger — Story recorder (Svelte 5 module-level $state)
//
// Tracks an in-progress "recording": the user hits Start Story, the log-panel
// toolbar flips into recording mode, and every subsequent log entry is part
// of the section until they hit Stop.
//
// A marker is the id of the newest entry at the moment Begin Recording is
// pressed. On stop, the captured slice is every entry from index 0 up to (but
// not including) the marker — i.e. everything prepended since. A null marker
// means the log was empty at start; the whole log is captured.
//
// The setup instructions + model now live server-side (per provider), so the
// recorder only tracks the marker.
// =============================================================================

import type { LogEntry } from './log.svelte.js';
import { sessionLog } from './log.svelte.js';

let _recording = $state(false);
let _markerId = $state<string | null>(null);

// ---------------------------------------------------------------------------
// Getters
// ---------------------------------------------------------------------------

export function isRecording(): boolean {
	return _recording;
}

/** Live count of entries captured since recording began (reactive). */
export function recordedCount(): number {
	if (!_recording) return 0;
	if (_markerId === null) return sessionLog.entries.length;
	const idx = sessionLog.entries.findIndex((e) => e.id === _markerId);
	if (idx < 0) return sessionLog.entries.length; // marker was deleted → capture all
	return idx;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Begin recording. Captures the current top-of-log id as the marker. */
export function beginRecording(): void {
	_markerId = sessionLog.entries[0]?.id ?? null;
	_recording = true;
}

/** Return the captured slice (newest-first, matching sessionLog storage). */
export function captureSection(): LogEntry[] {
	if (_markerId === null) return [...sessionLog.entries];
	const idx = sessionLog.entries.findIndex((e) => e.id === _markerId);
	if (idx < 0) return [...sessionLog.entries];
	return sessionLog.entries.slice(0, idx);
}

/** Stop recording and return the captured section (does not reset state). */
export function stopRecording(): LogEntry[] {
	const section = captureSection();
	_recording = false;
	return section;
}

/** Discard the current recording without generation. */
export function cancelRecording(): void {
	_recording = false;
	_markerId = null;
}
