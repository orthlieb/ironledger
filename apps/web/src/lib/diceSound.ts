// =============================================================================
// Iron Ledger — Dice + miss-scream audio (Web Audio API)
//
// We don't use @3d-dice/dice-box-threejs's built-in sound system: it loads
// audio via `new Audio()` and `await`s preload events that iOS Safari
// withholds without a gesture, hanging `_diceBox.initialize()` indefinitely.
//
// Instead, we fetch the same MP3s ourselves and play them through the
// Web Audio API, which iOS handles cleanly once the AudioContext is
// unlocked from a user gesture (the click on the Roll button is the
// gesture; the AudioContext is created inside that chain on first call).
//
// Three public functions:
//   - isDiceSoundEnabled / setDiceSoundEnabled — settings toggle (existing)
//   - playDiceClacks(count)  — schedule a tumbling sound for `count` dice
//   - playMissScream()       — fire the Wilhelm scream (move-roll miss)
// =============================================================================

const SOUND_KEY = 'ironledger:dice:sound';

// Plastic-die-hit MP3s shipped by @3d-dice/dice-box-threejs. Loading them
// from the same CDN we already use for the library script keeps deploys
// network-light and avoids needing to commit binary assets.
const DICE_HIT_BASE = 'https://cdn.jsdelivr.net/npm/@3d-dice/dice-box-threejs@0.0.12/public/sounds/dicehit/';
const DICE_HIT_VARIANTS = [1, 3, 5, 7, 9, 11, 13];

// Wilhelm scream. Wikimedia Commons hosts the original OGG plus an
// auto-transcoded MP3; we use the MP3 because iOS Safari's Web Audio
// can fail to decode OGG on older versions. Public domain (US, pre-1928).
const WILHELM_URL =
	'https://upload.wikimedia.org/wikipedia/commons/transcoded/8/82/Wilhelm_Scream.ogg/Wilhelm_Scream.ogg.mp3';

let _ctx: AudioContext | null = null;
const _buffers = new Map<string, Promise<AudioBuffer>>();

// ---------------------------------------------------------------------------
// Toggle (persisted to localStorage)
// ---------------------------------------------------------------------------

export function isDiceSoundEnabled(): boolean {
	if (typeof window === 'undefined') return true;
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
// AudioContext + buffer loading
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
		const res = await fetch(url, { mode: 'cors' });
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

function playBuffer(
	ctx: AudioContext,
	buffer: AudioBuffer,
	when: number,
	volume: number,
	rate: number,
): void {
	const src = ctx.createBufferSource();
	src.buffer = buffer;
	src.playbackRate.value = rate;

	const gain = ctx.createGain();
	gain.gain.value = volume;

	src.connect(gain).connect(ctx.destination);
	src.start(when);
}

// ---------------------------------------------------------------------------
// Dice clacks
// ---------------------------------------------------------------------------

/**
 * Schedule a dice tumbling sound that loosely matches a roll of `diceCount`
 * dice. Each die contributes ~3 plastic clacks scheduled across the first
 * 1.2 s with random offsets, ±15 % pitch jitter, and intensity tapering as
 * the dice slow. Total length matches the typical physics settle time
 * (~1.5 s) so the rattle ends as the dice come to rest.
 */
export async function playDiceClacks(diceCount: number): Promise<void> {
	if (!isDiceSoundEnabled()) return;
	if (diceCount <= 0) return;
	const ctx = getCtx();
	if (!ctx) return;
	if (ctx.state === 'suspended') void ctx.resume();

	// Load every variant in parallel; whichever finish first will be used.
	const buffers = (await Promise.all(
		DICE_HIT_VARIANTS.map((n) => loadBuffer(`${DICE_HIT_BASE}dicehit_plastic${n}.mp3`)),
	)).filter((b): b is AudioBuffer => b !== null);

	if (buffers.length === 0) return;

	const t0 = ctx.currentTime;
	const totalHits = Math.max(3, diceCount * 3);

	for (let i = 0; i < totalHits; i++) {
		const buf = buffers[Math.floor(Math.random() * buffers.length)];
		if (!buf) continue;
		const offset = Math.random() * 1.2;                   // 0–1.2 s
		const rate   = 0.85 + Math.random() * 0.3;            // 0.85–1.15
		const vol    = (0.45 + Math.random() * 0.25) * (1 - offset / 1.6);
		playBuffer(ctx, buf, t0 + offset, vol, rate);
	}
}

// ---------------------------------------------------------------------------
// Wilhelm scream — call on a move-roll miss
// ---------------------------------------------------------------------------

/** Pre-warm the Wilhelm scream buffer so the first miss isn't delayed by a fetch. */
export function preloadMissScream(): void {
	void loadBuffer(WILHELM_URL);
}

/**
 * Fire the Wilhelm scream. Gates on the same `isDiceSoundEnabled()` toggle
 * as the dice clacks — turn dice sounds off, the scream is silent too.
 */
export async function playMissScream(): Promise<void> {
	if (!isDiceSoundEnabled()) return;
	const ctx = getCtx();
	if (!ctx) return;
	if (ctx.state === 'suspended') void ctx.resume();

	const buf = await loadBuffer(WILHELM_URL);
	if (!buf) return;
	playBuffer(ctx, buf, ctx.currentTime, 0.7, 1.0);
}
