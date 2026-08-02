// =============================================================================
// Iron Ledger — Dice Rolling Engine
//
// Provides:
//   • rollDie(sides)       — simple fair die
//   • rollD100()           — d100 (1–100)
//   • animateDice(specs[]) — 3D animation via @3d-dice/dice-box-threejs (CDN)
//   • preloadDice()        — background library pre-fetch
//
// The DiceBox instance and DOM overlay are module-level singletons so multiple
// DiceRollerDialog instances share one Three.js context.
// =============================================================================

import { isDiceSoundEnabled } from './diceSound.js';

/** CDN paths for the 3D dice library and its asset bundle. */
const DICE_LIB_URL =
	'https://cdn.jsdelivr.net/npm/@3d-dice/dice-box-threejs@0.0.12/dist/dice-box-threejs.umd.js';
const DICE_ASSET_CDN = 'https://cdn.jsdelivr.net/npm/@3d-dice/dice-box-threejs@0.0.12/public/';

/** How long (ms) to keep the dice overlay visible after they land. */
const DICE_LINGER_MS = 600;

// ---------------------------------------------------------------------------
// Die colour themes  (matching reference implementation)
// ---------------------------------------------------------------------------
/** Blue — used for d6 (action die). */
export const DIE_BLUE = {
	foreground: '#ffffff',
	background: '#5383EC',
	outline: 'none',
	texture: 'none',
} as const;
/** Red  — used for d10 (challenge dice). */
const DIE_RED = {
	foreground: '#ffffff',
	background: '#DD0000',
	outline: 'none',
	texture: 'none',
} as const;
/** Black — used for the tens d10 in a d100 roll. */
export const DIE_BLACK = {
	foreground: '#ffffff',
	background: '#222222',
	outline: 'none',
	texture: 'none',
} as const;
/** White — used for the ones d10 in a d100 roll. */
export const DIE_WHITE = {
	foreground: '#000000',
	background: '#ffffff',
	outline: 'none',
	texture: 'none',
} as const;

// ---------------------------------------------------------------------------
// User-configurable dice appearance (persisted to localStorage)
//
// The action die (d6) and challenge dice (d10) each carry a user-chosen
// background colour; a single texture is shared across every die (the d100
// tens/ones keep their black/white backgrounds for legibility but still pick
// up the texture). Colours + texture ride inside the custom colorset the 3D
// library already consumes per roll via updateConfig — no re-init needed, so
// changes land on the very next roll.
// ---------------------------------------------------------------------------
const DICE_ACTION_COLOR_KEY = 'ironledger:diceActionColor';
const DICE_CHALLENGE_COLOR_KEY = 'ironledger:diceChallengeColor';
const DICE_TEXTURE_KEY = 'ironledger:diceTexture';

/** Factory defaults — the historical hard-coded backgrounds. */
export const DEFAULT_ACTION_COLOR = DIE_BLUE.background; // '#5383EC'
export const DEFAULT_CHALLENGE_COLOR = DIE_RED.background; // '#DD0000'
export const DEFAULT_DICE_TEXTURE = 'none';

/** Texture choices for the settings dropdown. `value` is the library's own
 *  texture key (validated against its TEXTURELIST — an unknown key falls back
 *  to `none`). Curated to the visually distinct entries, skipping the near-
 *  duplicate (`*_2`) and novelty character skins the library also ships. */
export const DICE_TEXTURE_OPTIONS: { value: string; label: string }[] = [
	{ value: 'none', label: 'None (smooth)' },
	{ value: 'cloudy', label: 'Cloudy' },
	{ value: 'marble', label: 'Marble' },
	{ value: 'fire', label: 'Fire' },
	{ value: 'ice', label: 'Ice' },
	{ value: 'water', label: 'Water' },
	{ value: 'paper', label: 'Paper' },
	{ value: 'speckles', label: 'Speckles' },
	{ value: 'glitter', label: 'Glitter' },
	{ value: 'stars', label: 'Stars' },
	{ value: 'stainedglass', label: 'Stained glass' },
	{ value: 'wood', label: 'Wood' },
	{ value: 'metal', label: 'Metal' },
	{ value: 'skulls', label: 'Skulls' },
	{ value: 'astral', label: 'Astral' },
	{ value: 'dragon', label: 'Dragon' },
	{ value: 'lizard', label: 'Lizard' },
	{ value: 'leopard', label: 'Leopard' },
	{ value: 'tiger', label: 'Tiger' },
	{ value: 'cheetah', label: 'Cheetah' },
];

function readPref(key: string, fallback: string): string {
	if (typeof window === 'undefined') return fallback;
	return localStorage.getItem(key) || fallback;
}
function writePref(key: string, value: string): void {
	if (typeof window === 'undefined') return;
	localStorage.setItem(key, value);
}

/** Action die (d6) background colour. */
export function getDiceActionColor(): string {
	return readPref(DICE_ACTION_COLOR_KEY, DEFAULT_ACTION_COLOR);
}
export function setDiceActionColor(color: string): void {
	writePref(DICE_ACTION_COLOR_KEY, color);
}
/** Challenge dice (d10) background colour. */
export function getDiceChallengeColor(): string {
	return readPref(DICE_CHALLENGE_COLOR_KEY, DEFAULT_CHALLENGE_COLOR);
}
export function setDiceChallengeColor(color: string): void {
	writePref(DICE_CHALLENGE_COLOR_KEY, color);
}
/** Shared texture key applied to every die. */
export function getDiceTexture(): string {
	return readPref(DICE_TEXTURE_KEY, DEFAULT_DICE_TEXTURE);
}
export function setDiceTexture(texture: string): void {
	writePref(DICE_TEXTURE_KEY, texture);
}

/** Physical material used by the 3D dice library for shading + physics
 *  + hit-sound selection. Fed as `theme_material` and `sound_dieMaterial`
 *  at DiceBox init; a mid-session change requires re-initialising the
 *  singleton, which `resetDiceBox()` below handles. */
const DICE_MATERIAL_KEY = 'ironledger:diceMaterial';
export const DEFAULT_DICE_MATERIAL = 'plastic';
export const DICE_MATERIAL_OPTIONS: { value: string; label: string }[] = [
	{ value: 'plastic', label: 'Plastic (default)' },
	{ value: 'wood', label: 'Wood' },
	{ value: 'metal', label: 'Metal' },
	{ value: 'glass', label: 'Glass' },
];
export function getDiceMaterial(): string {
	return readPref(DICE_MATERIAL_KEY, DEFAULT_DICE_MATERIAL);
}
export function setDiceMaterial(material: string): void {
	writePref(DICE_MATERIAL_KEY, material);
}

// ---------------------------------------------------------------------------
// 3D dice toggle (persisted to localStorage)
// ---------------------------------------------------------------------------
const DICE_3D_KEY = 'ironledger:dice3d';

/** Whether 3D dice animation is enabled. */
export function isDice3dEnabled(): boolean {
	if (typeof window === 'undefined') return true;
	return localStorage.getItem(DICE_3D_KEY) !== 'off';
}

/** Toggle 3D dice animation on/off and persist the preference. */
export function setDice3dEnabled(enabled: boolean): void {
	if (typeof window === 'undefined') return;
	if (enabled) {
		localStorage.removeItem(DICE_3D_KEY);
	} else {
		localStorage.setItem(DICE_3D_KEY, 'off');
	}
}

// ---------------------------------------------------------------------------
// Module-level singletons
// ---------------------------------------------------------------------------
let _scriptLoaded: Promise<void> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _diceBox: any = null;
let _diceBoxReady: Promise<void> | null = null;

/**
 * Push the current overlay dimensions into the dice library, so the camera
 * and physics walls match what the user actually sees on screen.
 *
 * The library has its own debounced `resize` listener, but on the
 * no-arguments code path it sets `containerWidth = clientWidth / 2`,
 * shrinking the play area to a quarter of the visible canvas. Calling
 * `setDimensions({ x, y })` ourselves with the real overlay size keeps the
 * walls flush with the visible viewport. setDimensions reads `dimensions.x`
 * and `dimensions.y` only — a plain object works the same as THREE.Vector2,
 * which we don't have access to outside the library bundle.
 */
function syncDiceBoxToOverlay(): void {
	if (!_diceBox) return;
	const overlay = getOverlay();
	const w = overlay.clientWidth;
	const h = overlay.clientHeight;
	if (w === 0 || h === 0) return; // overlay not yet laid out
	try {
		_diceBox.setDimensions({ x: w, y: h });
	} catch (e) {
		console.warn('[Iron Ledger] dice setDimensions failed:', e);
	}
}

/**
 * Attach our own listeners for `resize` and `orientationchange`. iOS in
 * particular fires `orientationchange` *before* the layout settles, and the
 * library's debounced `resize` listener can read stale dimensions, so we
 * re-sync after a couple of animation frames + a backup setTimeout.
 * Idempotent — only attaches once per session.
 */
let _resizeListenerAttached = false;
function attachResizeListener(): void {
	if (_resizeListenerAttached || typeof window === 'undefined') return;
	_resizeListenerAttached = true;

	let pending: ReturnType<typeof setTimeout> | null = null;
	const sync = () => {
		if (pending !== null) clearTimeout(pending);
		pending = setTimeout(syncDiceBoxToOverlay, 200);
	};

	window.addEventListener('resize', sync);
	window.addEventListener('orientationchange', () => {
		// orientationchange fires before the new layout is computed; defer
		// the sync until after the browser has rotated and re-laid out.
		requestAnimationFrame(() => requestAnimationFrame(sync));
		sync(); // backup if rAF doesn't fire (page hidden, etc.)
	});
}

/** Return (or lazily create) the full-screen overlay div for Three.js rendering. */
function getOverlay(): HTMLDivElement {
	const existing = document.getElementById('il-dice-overlay');
	if (existing) return existing as HTMLDivElement;

	const div = document.createElement('div');
	div.id = 'il-dice-overlay';
	Object.assign(div.style, {
		// visibility:hidden (not display:none) keeps the element in layout so
		// position:fixed + inset:0 gives it full viewport dimensions.
		// Three.js reads the container size at init — display:none would give 0×0
		// and the WebGL renderer would be created with a zero-size canvas.
		visibility: 'hidden',
		position: 'fixed',
		inset: '0',
		zIndex: '9999',
		pointerEvents: 'none',
		background: 'transparent',
	});
	document.body.appendChild(div);
	return div;
}

/** Dynamically load the CDN script (idempotent — safe to call many times). */
function loadScript(): Promise<void> {
	if (_scriptLoaded) return _scriptLoaded;
	_scriptLoaded = new Promise<void>((resolve, reject) => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		if ((window as any)['dice-box-threejs']) {
			resolve();
			return;
		}
		const s = document.createElement('script');
		s.src = DICE_LIB_URL;
		s.onload = () => resolve();
		s.onerror = () => {
			// Clear the cache so a subsequent roll can retry the CDN fetch.
			_scriptLoaded = null;
			reject(new Error('Failed to load dice-box-threejs from CDN'));
		};
		document.head.appendChild(s);
	});
	return _scriptLoaded;
}

/** Ensure the DiceBox is initialised and ready to roll (idempotent). */
function ensureDiceBox(): Promise<void> {
	if (_diceBoxReady) return _diceBoxReady;
	_diceBoxReady = loadScript()
		.then(async () => {
			getOverlay(); // create the overlay div before DiceBox tries to attach to it
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const Lib = (window as any)['dice-box-threejs'];
			// Library audio: 15 plastic-die-hit MP3s on the same CDN we already
			// pull the script from. `isDiceSoundEnabled()` is hard-false on iOS
			// (the library's `loadSounds()` pipeline hangs `_diceBox.initialize`
			// there), so iPhone never tries to load audio and never hangs.
			const wantSounds = isDiceSoundEnabled();
			// On desktop the overlay is large and default-sized dice read as
			// tiny. Bump the library's die scale 1.5× when the viewport is
			// clearly a desktop. Mobile keeps the default (100) — dice are
			// already visually large relative to a phone screen.
			const desktop =
				typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;
			const material = getDiceMaterial();
			_diceBox = new Lib('#il-dice-overlay', {
				assetPath: DICE_ASSET_CDN,
				sounds: wantSounds,
				sound_dieMaterial: material,
				volume: wantSounds ? 60 : 0,
				shadows: false,
				theme_colorset: 'custom',
				theme_material: material,
				gravity_multiplier: 1000,
				strength: 1,
				iterationLimit: 500,
				theme_customColorset: DIE_RED,
				scale: desktop ? 150 : 100,
			});
			await _diceBox.initialize();
			// Hide the shadow-catching ground plane after initialisation.
			// It can reappear after clearDice(), so we also hide it there.
			if (_diceBox.desk) _diceBox.desk.visible = false;
			// Make sure the camera + walls match the current viewport, then
			// keep them in sync across resize / rotation.
			syncDiceBoxToOverlay();
			attachResizeListener();
		})
		.catch((e: unknown) => {
			// Clear the cache so the next roll will retry initialisation from scratch.
			_diceBoxReady = null;
			_diceBox = null;
			throw e;
		});
	return _diceBoxReady;
}

/** Tear down the DiceBox singleton so the next roll re-initialises it.
 *  Used when a setting that only applies at init time changes — currently
 *  the physical material (Plastic / Wood / Metal), which is fed to the
 *  library as `theme_material` + `sound_dieMaterial`. Colours + texture
 *  ride via `updateConfig` and don't need this. */
export function resetDiceBox(): void {
	_diceBoxReady = null;
	_diceBox = null;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/** Roll a single fair die using CSPRNG; returns an integer in [1, sides]. */
export function rollDie(sides: number): number {
	const arr = new Uint32Array(1);
	crypto.getRandomValues(arr);
	return (arr[0] % sides) + 1;
}

/** Roll d100 using CSPRNG; returns an integer in [1, 100]. */
export function rollD100(): number {
	const arr = new Uint32Array(1);
	crypto.getRandomValues(arr);
	return (arr[0] % 100) + 1;
}

export interface DiceSpec {
	sides: number;
	value: number;
	/** Override the default colour theme for this die group. */
	color?: object;
}

/**
 * Show 3D dice animation for a set of pre-rolled values.
 *
 * Dice are grouped into roll steps by (sides, colour).  Consecutive dice
 * sharing the same sides and colour are batched into a single
 * `{count}d{sides}@{v1,v2,...}` notation.  Each step is chained via
 * `.then()` so the colour config is applied only after the previous step's
 * physics have settled, matching the reference implementation.
 *
 * The library is loaded from CDN on first call; subsequent calls reuse the
 * cached instance.  The function always resolves — animation failures are
 * logged to the console but do not affect the caller's roll result.
 */
export async function animateDice(dice: DiceSpec[]): Promise<void> {
	if (typeof window === 'undefined' || dice.length === 0) return;
	if (!isDice3dEnabled()) return;

	const overlay = getOverlay();
	overlay.style.visibility = 'visible';

	try {
		await ensureDiceBox();

		// Clear any leftover dice from a previous roll.
		if (_diceBox.clearDice) _diceBox.clearDice();
		// Re-hide the desk — clearDice() can make it reappear.
		if (_diceBox.desk) _diceBox.desk.visible = false;

		// ---------------------------------------------------------------------------
		// Resolve the user's appearance prefs ONCE per roll: the action-die (d6)
		// and challenge-die (d10) backgrounds, plus one texture shared by every
		// die. Each theme is a single object so all dice in a group share one
		// reference — the grouping test below is reference equality, which
		// collapses e.g. two challenge d10s into one `2d10@a,b` step.
		// ---------------------------------------------------------------------------
		const texture = getDiceTexture();
		const actionTheme = { ...DIE_BLUE, background: getDiceActionColor(), texture };
		const challengeTheme = { ...DIE_RED, background: getDiceChallengeColor(), texture };
		const otherTheme = { ...DIE_RED, texture };
		// A die may pass an explicit colour (the d100 tens/ones use black+white
		// for legibility). Keep that background but apply the shared texture,
		// memoised by the source object so grouping identity still holds.
		const explicitThemes = new Map<object, object>();
		const themeForDie = (die: DiceSpec): object => {
			if (die.color) {
				let t = explicitThemes.get(die.color);
				if (!t) {
					t = { ...(die.color as Record<string, unknown>), texture };
					explicitThemes.set(die.color, t);
				}
				return t;
			}
			if (die.sides === 6) return actionTheme;
			if (die.sides === 10) return challengeTheme;
			return otherTheme;
		};

		// ---------------------------------------------------------------------------
		// Build roll steps: group consecutive dice with identical (sides, theme).
		// Each group becomes one roll/add call with batched notation.
		// ---------------------------------------------------------------------------
		type Step = { theme: object; sides: number; values: number[] };
		const steps: Step[] = [];

		for (const die of dice) {
			const theme = themeForDie(die);
			const last = steps[steps.length - 1];
			if (last && last.sides === die.sides && last.theme === theme) {
				last.values.push(die.value);
			} else {
				steps.push({ theme, sides: die.sides, values: [die.value] });
			}
		}

		const stepNotation = (s: Step) => `${s.values.length}d${s.sides}@${s.values.join(',')}`;

		const applyTheme = (theme: object) =>
			_diceBox.updateConfig({ theme_colorset: 'custom', theme_customColorset: theme });

		// Make sure the camera + physics walls match the current viewport
		// before launching dice — handles late layout settle after rotation
		// and any case where the library's debounced resize listener was
		// triggered with a stale half-size value.
		syncDiceBoxToOverlay();

		// Roll first step, then chain subsequent steps via .then() so each colour
		// change is applied only after the previous dice have been placed.
		//
		// `updateConfig` is ASYNC — it awaits `loadTheme`, which fetches the
		// texture image. `roll()` / `add()` read the active colourset
		// synchronously, so applyTheme MUST be awaited before launching dice;
		// otherwise the colourset lands one step late and colours appear
		// shifted between dice groups. This was invisible while every die used
		// `texture: 'none'` (loadTheme resolved synchronously) and only
		// surfaced once user-selectable textures made the load slow enough to
		// lose the race.
		await applyTheme(steps[0].theme);
		// Apply the current sound preference. Effective only when sounds
		// were loaded at init time (i.e. the toggle was on at last reload
		// AND the device isn't iOS); otherwise the library has nothing to
		// mute/unmute and updateConfig is a cheap no-op.
		_diceBox.updateConfig({ volume: isDiceSoundEnabled() ? 60 : 0 });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let p: Promise<any> = _diceBox.roll(stepNotation(steps[0]));
		for (let i = 1; i < steps.length; i++) {
			const step = steps[i];
			p = p.then(async () => {
				await applyTheme(step.theme);
				return _diceBox.add(stepNotation(step));
			});
		}
		await p;

		await new Promise<void>((r) => setTimeout(r, DICE_LINGER_MS));
	} catch (e) {
		console.warn('[Iron Ledger] 3D dice animation failed:', e);
	} finally {
		overlay.style.visibility = 'hidden';
	}
}

/**
 * Kick off background loading of the dice library.
 * Deferred via requestIdleCallback (setTimeout fallback) so it runs after the
 * browser has finished the initial paint and is otherwise idle — avoids
 * competing with page render for network and CPU.
 * Safe to call multiple times; the DiceBox singleton is only created once.
 */
export function preloadDice(): void {
	if (typeof window === 'undefined') return;
	const load = () => ensureDiceBox().catch(() => {});
	if ('requestIdleCallback' in window) {
		// Allow up to 5 s for the browser to find idle time, then force it.
		(window as Window & typeof globalThis).requestIdleCallback(load, { timeout: 5000 });
	} else {
		// Safari < 16 and some older browsers don't support requestIdleCallback.
		setTimeout(load, 200);
	}
}
