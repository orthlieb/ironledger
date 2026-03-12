// =============================================================================
// Iron Ledger — Character data types
// Mirrors the YRT character model (stored as JSONB in PostgreSQL)
// =============================================================================

export type TouchedLevel = 'pure' | 'prime' | 'second' | 'third' | 'feral';

export type VowDifficulty =
	| 'troublesome'
	| 'dangerous'
	| 'formidable'
	| 'extreme'
	| 'epic';

export interface Vow {
	id: string;
	name: string;
	difficulty: VowDifficulty;
	ticks: number; // 0–40 (10 boxes × 4 ticks)
	threat: string;
	menace: string;
}

export interface CharacterAsset {
	assetId: string;
	abilities: boolean[]; // enabled flags per ability
	rarityId?: string;
	companionName?: string;
	companionHealth?: number;
}

export interface CharacterData {
	// Identity
	name: string;
	background: string;
	portrait?: string; // base64 JPEG data URL

	// Core stats (1–4, rarely 5)
	edge: number;
	heart: number;
	iron: number;
	shadow: number;
	wits: number;

	// YRT homebrew
	touched: TouchedLevel;
	touchedAnimal: string;

	// Resources
	momentum: number; // –6 to dynamic max (10 − debilityCount)
	health: number;   // 0–5  (blocked by Wounded)
	spirit: number;   // 0–5  (blocked by Shaken)
	supply: number;   // 0–5  (party-wide in full app)
	mana: number;     // 0–10 (YRT Conclave)

	// Progress
	xp: number;       // 0–30
	bonds: number;    // 0–40
	failures: number; // 0–40

	// Debilities — Conditions
	wounded: boolean;
	unprepared: boolean;
	shaken: boolean;
	encumbered: boolean;
	// Banes
	maimed: boolean;
	corrupted: boolean;
	// Burdens
	cursed: boolean;
	tormented: boolean;

	// Collections
	vows: Vow[];
	assets: CharacterAsset[];
}

// Default values for a freshly created character
export const DEFAULT_CHARACTER: CharacterData = {
	name: 'New Character',
	background: '',
	edge: 1,
	heart: 1,
	iron: 1,
	shadow: 1,
	wits: 1,
	touched: 'pure',
	touchedAnimal: '',
	momentum: 2,
	health: 5,
	spirit: 5,
	supply: 3,
	mana: 0,
	xp: 0,
	bonds: 0,
	failures: 0,
	wounded: false,
	unprepared: false,
	shaken: false,
	encumbered: false,
	maimed: false,
	corrupted: false,
	cursed: false,
	tormented: false,
	vows: [],
	assets: [],
};

// Ticks earned per Mark Progress action by difficulty
export const VOW_MARK_TICKS: Record<VowDifficulty, number> = {
	troublesome: 12,
	dangerous: 8,
	formidable: 4,
	extreme: 2,
	epic: 1,
};
