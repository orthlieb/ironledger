// =============================================================================
// Iron Ledger — Dice sound preference
//
// The actual audio is provided by @3d-dice/dice-box-threejs, which ships
// real plastic-die-hit MP3s and plays a randomised variant per physics
// collision. This module just persists the on/off toggle to localStorage.
// dice.ts reads it via `isDiceSoundEnabled()` and applies the result via
// `_diceBox.updateConfig({ volume: ... })` on each roll, so a Settings
// change takes effect on the next throw without reinitialising the box.
// =============================================================================

const SOUND_KEY = 'ironledger:dice:sound';

/** Whether dice sounds are enabled (persisted to localStorage). */
export function isDiceSoundEnabled(): boolean {
	if (typeof window === 'undefined') return true;
	return localStorage.getItem(SOUND_KEY) !== 'off';
}

/** Toggle dice sounds on/off and persist the preference. */
export function setDiceSoundEnabled(enabled: boolean): void {
	if (typeof window === 'undefined') return;
	if (enabled) {
		localStorage.removeItem(SOUND_KEY);
	} else {
		localStorage.setItem(SOUND_KEY, 'off');
	}
}
