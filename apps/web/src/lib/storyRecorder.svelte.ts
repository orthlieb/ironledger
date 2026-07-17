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
// The recording (whether active + its marker) is persisted to localStorage so a
// mid-recording page reload or session timeout doesn't lose the start point —
// the log is global and re-fetched on reload, and entry ids are stable, so the
// restored marker still points at the right spot. The setup instructions + model
// live elsewhere, so the recorder only tracks the marker.
// =============================================================================

import type { LogEntry } from './log.svelte.js';
import { sessionLog } from './log.svelte.js';

const RECORDING_STORAGE = 'ironledger:ai:recording';

interface RecordingState {
	recording: boolean;
	markerId: string | null;
	/** Top-of-log id at the moment of the last stop — null unless we stopped
	 *  and no new entry has been prepended since. Used by canContinue(). */
	stoppedAtTopId: string | null;
}

function readRecording(): RecordingState {
	if (typeof window === 'undefined')
		return { recording: false, markerId: null, stoppedAtTopId: null };
	try {
		const raw = localStorage.getItem(RECORDING_STORAGE);
		if (!raw) return { recording: false, markerId: null, stoppedAtTopId: null };
		const p = JSON.parse(raw) as Partial<RecordingState>;
		return {
			recording: !!p.recording,
			markerId: typeof p.markerId === 'string' ? p.markerId : null,
			stoppedAtTopId: typeof p.stoppedAtTopId === 'string' ? p.stoppedAtTopId : null,
		};
	} catch {
		return { recording: false, markerId: null, stoppedAtTopId: null };
	}
}

/** Persist while there's continuable state (recording or a fresh pause). */
function persistRecording(): void {
	if (typeof window === 'undefined') return;
	if (_recording || _stoppedAtTopId !== null) {
		localStorage.setItem(
			RECORDING_STORAGE,
			JSON.stringify({
				recording: _recording,
				markerId: _markerId,
				stoppedAtTopId: _stoppedAtTopId,
			}),
		);
	} else {
		localStorage.removeItem(RECORDING_STORAGE);
	}
}

const _initial = readRecording();
let _recording = $state(_initial.recording);
let _markerId = $state<string | null>(_initial.markerId);
let _stoppedAtTopId = $state<string | null>(_initial.stoppedAtTopId);

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

/**
 * True when the user stopped a recording AND no new log entry has been
 * prepended since — hitting Start Story right after Stop would be a
 * "continue" (resume the same marker) rather than a new recording. As soon
 * as any entry is added, canContinue flips false and a fresh recording is
 * the only option.
 */
export function canContinue(): boolean {
	if (_recording) return false;
	if (_markerId === null || _stoppedAtTopId === null) return false;
	return (sessionLog.entries[0]?.id ?? null) === _stoppedAtTopId;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Begin a fresh recording. Captures the current top-of-log id as the marker. */
export function beginRecording(): void {
	_markerId = sessionLog.entries[0]?.id ?? null;
	_recording = true;
	// Fresh recording invalidates any prior pause state.
	_stoppedAtTopId = null;
	persistRecording();
}

/**
 * Resume a stopped recording without changing the marker. Only meaningful
 * when canContinue() is true; the LogPanel + CommandBar guard the call.
 * Clearing _stoppedAtTopId here prevents "continue" from working twice in
 * a row without another stop between.
 */
export function continueRecording(): void {
	_recording = true;
	_stoppedAtTopId = null;
	persistRecording();
}

/** Return the captured slice (newest-first, matching sessionLog storage). */
export function captureSection(): LogEntry[] {
	if (_markerId === null) return [...sessionLog.entries];
	const idx = sessionLog.entries.findIndex((e) => e.id === _markerId);
	if (idx < 0) return [...sessionLog.entries];
	return sessionLog.entries.slice(0, idx);
}

/**
 * Stop recording and return the captured section. Keeps the marker so a
 * subsequent /continue can pick up where we left off, and remembers the
 * current top-of-log id so canContinue() can tell whether the user has
 * added anything since — the moment they do, it's a new recording.
 */
export function stopRecording(): LogEntry[] {
	const section = captureSection();
	_recording = false;
	_stoppedAtTopId = sessionLog.entries[0]?.id ?? null;
	persistRecording();
	return section;
}

/** Discard the current recording without generation. */
export function cancelRecording(): void {
	_recording = false;
	_markerId = null;
	_stoppedAtTopId = null;
	persistRecording();
}
