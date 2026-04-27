// =============================================================================
// Iron Ledger — Dice rattle (Web Audio synth)
//
// Generates a procedural dice-tumble sound to play alongside animateDice().
// No audio asset is shipped: clicks are short bursts of band-pass-filtered
// white noise, scheduled with irregular spacing and a tapering envelope so
// the rattle feels like dice slowing in a cup. Total length is ~1.4 s,
// chosen to end just before the typical 1.5–1.7 s physics settle in
// dice-box-threejs (with our gravity_multiplier=1000, strength=1) so the
// dice come to visual rest in silence.
// =============================================================================

const SOUND_KEY = 'ironledger:dice:sound';

let _ctx: AudioContext | null = null;

/** Whether the dice-rattle sound is enabled (persisted to localStorage). */
export function isDiceSoundEnabled(): boolean {
	if (typeof window === 'undefined') return true;
	return localStorage.getItem(SOUND_KEY) !== 'off';
}

/** Toggle dice-rattle on/off and persist the preference. */
export function setDiceSoundEnabled(enabled: boolean): void {
	if (typeof window === 'undefined') return;
	if (enabled) {
		localStorage.removeItem(SOUND_KEY);
	} else {
		localStorage.setItem(SOUND_KEY, 'off');
	}
}

/**
 * Lazily create the shared AudioContext. iOS Safari only allows the context
 * to start playback after a user gesture — `animateDice()` is always called
 * from a click/tap handler, so the first call here happens inside a gesture
 * chain and unlocks the context for the rest of the session.
 */
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

/**
 * Play a procedurally-generated dice rattle. ~1.4 s, fire-and-forget.
 * Returns immediately even on first call; the AudioContext is unlocked
 * inside the user-gesture chain that called us.
 */
export function playDiceRattle(): void {
	if (!isDiceSoundEnabled()) return;
	const ctx = getCtx();
	if (!ctx) return;
	if (ctx.state === 'suspended') void ctx.resume();

	const t0 = ctx.currentTime;

	// Master envelope: most clicks land in the first ~1 s, then the rattle
	// fades out by 1.4 s. The exponential ramps approximate a real cup-shake
	// where the dice slow as they bleed kinetic energy.
	const master = ctx.createGain();
	master.gain.setValueAtTime(0.32, t0);
	master.gain.exponentialRampToValueAtTime(0.06, t0 + 1.2);
	master.gain.exponentialRampToValueAtTime(0.001, t0 + 1.4);
	master.connect(ctx.destination);

	// 9–12 individual clicks, irregularly spaced. Spacing widens as `progress`
	// approaches 1, so clicks bunch at the start (chaotic shake) and spread
	// at the end (last few tumbles before rest).
	const numClicks = 9 + Math.floor(Math.random() * 4);
	let when = t0 + 0.015;
	for (let i = 0; i < numClicks; i++) {
		const progress = i / (numClicks - 1);
		scheduleClick(ctx, master, when, progress);
		const dt = 0.045 + 0.11 * progress + Math.random() * 0.05;
		when += dt;
	}
}

/**
 * One click = a short burst of band-pass-filtered noise with a sharp attack
 * and exponential decay. Filter centre and Q are jittered per click so each
 * "tumble" sounds distinct rather than mechanical.
 */
function scheduleClick(
	ctx: AudioContext,
	dest: AudioNode,
	when: number,
	progress: number,
): void {
	const dur = 0.025 + Math.random() * 0.025;            // 25–50 ms
	const sampleCount = Math.max(1, Math.ceil(dur * ctx.sampleRate));
	const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
	const data = buffer.getChannelData(0);
	for (let i = 0; i < data.length; i++) {
		data[i] = Math.random() * 2 - 1;
	}

	const src = ctx.createBufferSource();
	src.buffer = buffer;

	const filter = ctx.createBiquadFilter();
	filter.type = 'bandpass';
	filter.frequency.value = 1500 + Math.random() * 1800;  // 1.5–3.3 kHz
	filter.Q.value = 5 + Math.random() * 5;

	const gain = ctx.createGain();
	// Gain peaks higher at the start of the rattle, lower as dice settle.
	const peak = 0.4 + 0.55 * (1 - progress);
	gain.gain.setValueAtTime(0.001, when);
	gain.gain.exponentialRampToValueAtTime(peak, when + 0.002);
	gain.gain.exponentialRampToValueAtTime(0.001, when + dur);

	src.connect(filter).connect(gain).connect(dest);
	src.start(when);
	src.stop(when + dur + 0.01);
}
