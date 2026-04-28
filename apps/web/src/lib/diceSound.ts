// =============================================================================
// Iron Ledger — Dice sound preference + miss scream
//
// Library audio (15 plastic-die-hit MP3s shipped by @3d-dice/dice-box-threejs)
// is the on-platform sound source — see dice.ts for how it's wired into the
// dice config. This module only handles:
//   - the Settings toggle (persisted to localStorage)
//   - the iOS gate, since dice-box-threejs's audio preload pipeline hangs
//     `_diceBox.initialize()` on iPhone Safari. Sounds are disabled on iOS
//     entirely; the Settings toggle is hidden on those devices.
//   - the Wilhelm scream on a move-roll miss, played via Web Audio API.
//     Ship the MP3 at `apps/web/static/sounds/wilhelm.mp3`. Without that
//     file the loader silently fails — the rest of the app keeps working.
// =============================================================================

const SOUND_KEY = 'ironledger:dice:sound';

const WILHELM_URL = '/sounds/wilhelm.mp3';

let _ctx: AudioContext | null = null;
const _buffers = new Map<string, Promise<AudioBuffer>>();

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

/**
 * iOS Safari (iPhone + iPadOS-as-Mac). dice-box-threejs's `loadSounds()`
 * pipeline awaits `canplaythrough` events that iOS withholds without a
 * gesture, hanging `_diceBox.initialize()`. Sounds are unavailable on iOS
 * until that's fixed upstream; we hide the Settings row entirely on these
 * devices to avoid showing a toggle that does nothing.
 */
export function isIOSSafari(): boolean {
	if (typeof window === 'undefined') return false;
	const ua = navigator.userAgent;
	const isClassicIOS = /iPad|iPhone|iPod/.test(ua);
	const isIPadOS    = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const isMSMobile  = !!(window as any).MSStream;
	return (isClassicIOS || isIPadOS) && !isMSMobile;
}

/** True iff this device can play dice sounds. SettingsDialog uses this to
 *  decide whether to render the "Dice Sound" row at all. */
export function isDiceSoundSupported(): boolean {
	if (typeof window === 'undefined') return false;
	return !isIOSSafari();
}

// ---------------------------------------------------------------------------
// Settings toggle
// ---------------------------------------------------------------------------

/**
 * Whether dice sounds should play. Hard-off on iOS regardless of the
 * stored preference — caller code can call this without re-checking the
 * platform.
 */
export function isDiceSoundEnabled(): boolean {
	if (typeof window === 'undefined') return false;
	if (isIOSSafari()) return false;
	return localStorage.getItem(SOUND_KEY) !== 'off';
}

export function setDiceSoundEnabled(enabled: boolean): void {
	if (typeof window === 'undefined') return;
	if (enabled) {
		localStorage.removeItem(SOUND_KEY);
	} else {
		localStorage.setItem(SOUND_KEY, 'off');
	}
}

// ---------------------------------------------------------------------------
// Wilhelm scream (Web Audio API — works on every platform we'd play it on)
// ---------------------------------------------------------------------------

function getCtx(): AudioContext | null {
	if (typeof window === 'undefined') return null;
	if (_ctx) return _ctx;
	type Ctor = typeof AudioContext;
	const W = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
	const Resolved = W.AudioContext ?? W.webkitAudioContext;
	if (!Resolved) return null;
	_ctx = new Resolved();
	return _ctx;
}

async function loadBuffer(url: string): Promise<AudioBuffer | null> {
	const cached = _buffers.get(url);
	if (cached) {
		try { return await cached; } catch { return null; }
	}
	const ctx = getCtx();
	if (!ctx) return null;

	const promise = (async () => {
		const res = await fetch(url);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const ab = await res.arrayBuffer();
		return await ctx.decodeAudioData(ab);
	})();

	_buffers.set(url, promise);
	try {
		return await promise;
	} catch (e) {
		console.warn('[Iron Ledger] audio load failed:', url, e);
		_buffers.delete(url);   // allow retry next time
		return null;
	}
}

/** Pre-warm the Wilhelm scream buffer so the first miss isn't delayed by a fetch. */
export function preloadMissScream(): void {
	if (!isDiceSoundEnabled()) return;
	void loadBuffer(WILHELM_URL);
}

/**
 * Fire the Wilhelm scream. Gates on the same `isDiceSoundEnabled()` toggle
 * as the dice clacks — turn dice sounds off, the scream is silent too.
 * Silent no-op if the local mp3 isn't shipped yet.
 */
export async function playMissScream(): Promise<void> {
	if (!isDiceSoundEnabled()) return;
	const ctx = getCtx();
	if (!ctx) return;
	if (ctx.state === 'suspended') void ctx.resume();

	const buf = await loadBuffer(WILHELM_URL);
	if (!buf) return;

	const src = ctx.createBufferSource();
	src.buffer = buf;
	const gain = ctx.createGain();
	gain.gain.value = 0.7;
	src.connect(gain).connect(ctx.destination);
	src.start(ctx.currentTime);
}
