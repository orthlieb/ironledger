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

/** CDN paths for the 3D dice library and its asset bundle. */
const DICE_LIB_URL =
	'https://cdn.jsdelivr.net/npm/@3d-dice/dice-box-threejs@0.0.12/dist/dice-box-threejs.umd.js';
const DICE_ASSET_CDN =
	'https://cdn.jsdelivr.net/npm/@3d-dice/dice-box-threejs@0.0.12/public/';

/** How long (ms) to keep the dice overlay visible after they land. */
const DICE_LINGER_MS = 600;

// ---------------------------------------------------------------------------
// Die colour themes  (matching reference implementation)
// ---------------------------------------------------------------------------
/** Blue — used for d6 (action die). */
export const DIE_BLUE  = { foreground: '#ffffff', background: '#5383EC', outline: 'none', texture: 'none' } as const;
/** Red  — used for d10 (challenge dice). */
const        DIE_RED   = { foreground: '#ffffff', background: '#DD0000', outline: 'none', texture: 'none' } as const;
/** Black — used for the tens d10 in a d100 roll. */
export const DIE_BLACK = { foreground: '#ffffff', background: '#222222', outline: 'none', texture: 'none' } as const;
/** White — used for the ones d10 in a d100 roll. */
export const DIE_WHITE = { foreground: '#000000', background: '#ffffff', outline: 'none', texture: 'none' } as const;

/** Default colour theme keyed by die size (d6 = blue, d10 = red). */
const DIE_THEME_BY_SIDES: Record<number, object> = {
	6:  DIE_BLUE,
	10: DIE_RED,
};

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
let _diceBox:      any                  = null;
let _diceBoxReady: Promise<void> | null = null;

/** Return (or lazily create) the full-screen overlay div for Three.js rendering. */
function getOverlay(): HTMLDivElement {
	const existing = document.getElementById('il-dice-overlay');
	if (existing) return existing as HTMLDivElement;

	const div = document.createElement('div');
	div.id = 'il-dice-overlay';
	Object.assign(div.style, {
		display:       'none',
		position:      'fixed',
		inset:         '0',
		zIndex:        '9999',
		pointerEvents: 'none',
		background:    'transparent',
	});
	document.body.appendChild(div);
	return div;
}

/** Dynamically load the CDN script (idempotent — safe to call many times). */
function loadScript(): Promise<void> {
	if (_scriptLoaded) return _scriptLoaded;
	_scriptLoaded = new Promise<void>((resolve, reject) => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		if ((window as any)['dice-box-threejs']) { resolve(); return; }
		const s       = document.createElement('script');
		s.src         = DICE_LIB_URL;
		s.onload      = () => resolve();
		s.onerror     = () => reject(new Error('Failed to load dice-box-threejs from CDN'));
		document.head.appendChild(s);
	});
	return _scriptLoaded;
}

/** Ensure the DiceBox is initialised and ready to roll (idempotent). */
function ensureDiceBox(): Promise<void> {
	if (_diceBoxReady) return _diceBoxReady;
	_diceBoxReady = loadScript().then(async () => {
		getOverlay(); // create the overlay div before DiceBox tries to attach to it
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const Lib  = (window as any)['dice-box-threejs'];
		_diceBox   = new Lib('#il-dice-overlay', {
			assetPath:            DICE_ASSET_CDN,
			sounds:               false,
			shadows:              false,
			theme_colorset:       'custom',
			theme_material:       'plastic',
			gravity_multiplier:   1000,
			strength:             1,
			iterationLimit:       500,
			theme_customColorset: DIE_RED,
		});
		await _diceBox.initialize();
		// Hide the shadow-catching ground plane after initialisation.
		// It can reappear after clearDice(), so we also hide it there.
		if (_diceBox.desk) _diceBox.desk.visible = false;
	});
	return _diceBoxReady;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/** Roll a single fair die; returns an integer in [1, sides]. */
export function rollDie(sides: number): number {
	return Math.floor(Math.random() * sides) + 1;
}

/** Roll d100; returns an integer in [1, 100]. */
export function rollD100(): number {
	return Math.floor(Math.random() * 100) + 1;
}

export interface DiceSpec {
	sides:  number;
	value:  number;
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
	overlay.style.display = 'block';

	try {
		await ensureDiceBox();

		// Clear any leftover dice from a previous roll.
		if (_diceBox.clearDice) _diceBox.clearDice();
		// Re-hide the desk — clearDice() can make it reappear.
		if (_diceBox.desk) _diceBox.desk.visible = false;

		// ---------------------------------------------------------------------------
		// Build roll steps: group consecutive dice with identical (sides, theme).
		// Each group becomes one roll/add call with batched notation.
		// ---------------------------------------------------------------------------
		type Step = { theme: object; sides: number; values: number[] };
		const steps: Step[] = [];

		for (const die of dice) {
			const theme = die.color ?? DIE_THEME_BY_SIDES[die.sides] ?? DIE_RED;
			const last  = steps[steps.length - 1];
			if (last && last.sides === die.sides && last.theme === theme) {
				last.values.push(die.value);
			} else {
				steps.push({ theme, sides: die.sides, values: [die.value] });
			}
		}

		const stepNotation = (s: Step) =>
			`${s.values.length}d${s.sides}@${s.values.join(',')}`;

		const applyTheme = (theme: object) =>
			_diceBox.updateConfig({ theme_colorset: 'custom', theme_customColorset: theme });

		// Roll first step, then chain subsequent steps via .then() so each colour
		// change is applied only after the previous dice have been placed.
		applyTheme(steps[0].theme);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let p: Promise<any> = _diceBox.roll(stepNotation(steps[0]));
		for (let i = 1; i < steps.length; i++) {
			const step = steps[i];
			p = p.then(() => {
				applyTheme(step.theme);
				return _diceBox.add(stepNotation(step));
			});
		}
		await p;

		await new Promise<void>(r => setTimeout(r, DICE_LINGER_MS));
	} catch (e) {
		console.warn('[Iron Ledger] 3D dice animation failed:', e);
	} finally {
		overlay.style.display = 'none';
	}
}

/**
 * Kick off background loading of the dice library.
 * Call once at app startup to minimise latency on the first actual roll.
 */
export function preloadDice(): void {
	if (typeof window === 'undefined') return;
	ensureDiceBox().catch(() => {});
}
