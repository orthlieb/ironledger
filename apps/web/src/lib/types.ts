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
	menace: number; // 0–10 menace track
}

export interface CharacterAsset {
	assetId: string;
	abilities: boolean[]; // enabled flags per ability
	rarityId?: string;
	/** Stores values for each entry in the asset definition's nameLabels array.
	 *  Old saves may have companionName (index 0 fallback) or companionHealth (counter fallback). */
	names?: string[];
	/** @deprecated legacy field from old companion system — read via `asset.counter ?? asset.companionHealth` */
	companionName?: string;
	/** @deprecated legacy field from old companion system — read via `asset.counter ?? asset.companionHealth` */
	companionHealth?: number;
	/** Index into the asset definition's radioLabels array (language-independent). */
	radioSelection?: number;
	/** Keys of selected items from a definition's selectable list (e.g. cantrips) */
	selections?: string[];
	/** Tracked counter/charge count for assets that define counterMax */
	counter?: number;
	/** Values for each entry in the asset definition's customFields array, keyed by field.key */
	customValues?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Foe catalogue types
// ---------------------------------------------------------------------------

export type FoeNature = 'Ironlander' | 'Firstborn' | 'Animal' | 'Beast' | 'Horror' | 'Anomaly';
export type FoeQuantity = 'solo' | 'pack' | 'horde';

export interface FoeDef {
	id:          string;      // "ironsworn/basilisk"
	name:        string;      // "Basilisk" — also used as image filename
	rank:        1 | 2 | 3 | 4 | 5;
	nature:      FoeNature;
	features:    string[];
	drives:      string[];
	tactics:     string[];
	description: string;
}

export interface FoeEncounter {
	id:            string;       // crypto.randomUUID()
	foeId:         string;       // references FoeDef.id
	quantity:      FoeQuantity;
	effectiveRank: 1 | 2 | 3 | 4 | 5;
	ticks:         number;       // 0–40 (10 boxes × 4 ticks)
	notes:         string;
	customName:    string;       // if '', display foeDef.name
	vanquished:    boolean;
}

// ---------------------------------------------------------------------------
// Expedition types (Journeys & Delve Sites)
// ---------------------------------------------------------------------------

/** Reuse VowDifficulty for expedition difficulty — same rank system. */
export type ExpeditionDifficulty = VowDifficulty;

/** Ticks earned per Mark Progress by difficulty (same scale as vows). */
export const EXPEDITION_MARK_TICKS: Record<ExpeditionDifficulty, number> = {
	troublesome: 12,
	dangerous: 8,
	formidable: 4,
	extreme: 2,
	epic: 1,
};

export type ExpeditionType = 'journey' | 'site';

export interface Journey {
	id:         string;          // crypto.randomUUID()
	type:       'journey';       // discriminant
	name:       string;
	difficulty: ExpeditionDifficulty;
	ticks:      number;          // 0–40 (10 boxes × 4 ticks)
	notes:      string;
	complete:   boolean;
}

/** The 8 Delve themes */
export type DelveTheme =
	| 'Ancient' | 'Corrupted' | 'Fortified' | 'Hallowed'
	| 'Haunted' | 'Infested' | 'Ravaged' | 'Wild';

export const DELVE_THEMES: DelveTheme[] = [
	'Ancient', 'Corrupted', 'Fortified', 'Hallowed',
	'Haunted', 'Infested', 'Ravaged', 'Wild',
];

/** The 12 Delve domains */
export type DelveDomain =
	| 'Barrow' | 'Cavern' | 'Frozen Cavern' | 'Icereach'
	| 'Mine' | 'Pass' | 'Ruin' | 'Sea Cave'
	| 'Shadowfen' | 'Stronghold' | 'Tanglewood' | 'Underkeep';

export const DELVE_DOMAINS: DelveDomain[] = [
	'Barrow', 'Cavern', 'Frozen Cavern', 'Icereach',
	'Mine', 'Pass', 'Ruin', 'Sea Cave',
	'Shadowfen', 'Stronghold', 'Tanglewood', 'Underkeep',
];

export interface Site {
	id:         string;          // crypto.randomUUID()
	type:       'site';          // discriminant
	name:       string;
	objective:  string;
	theme:      DelveTheme | '';
	domain:     DelveDomain | '';
	difficulty: ExpeditionDifficulty;
	ticks:      number;          // 0–40 (10 boxes × 4 ticks)
	denizens:   string[];        // length 12 — one per DENIZEN_CELLS row
	complete:   boolean;
}

/** Discriminated union of all expedition types. */
export type Expedition = Journey | Site;

/** Denizen cell definition for the 12-row d100 table. */
export interface DenizenCell {
	label: string;
	range: string;
	low:   number;
	high:  number;
}

export const DENIZEN_CELLS: DenizenCell[] = [
	{ label: 'Very Common', range: '01–27', low: 1,   high: 27  },
	{ label: 'Common',      range: '28–41', low: 28,  high: 41  },
	{ label: 'Common',      range: '42–55', low: 42,  high: 55  },
	{ label: 'Common',      range: '56–69', low: 56,  high: 69  },
	{ label: 'Uncommon',    range: '70–75', low: 70,  high: 75  },
	{ label: 'Uncommon',    range: '76–81', low: 76,  high: 81  },
	{ label: 'Uncommon',    range: '82–87', low: 82,  high: 87  },
	{ label: 'Uncommon',    range: '88–93', low: 88,  high: 93  },
	{ label: 'Rare',        range: '94–95', low: 94,  high: 95  },
	{ label: 'Rare',        range: '96–97', low: 96,  high: 97  },
	{ label: 'Rare',        range: '98–99', low: 98,  high: 99  },
	{ label: 'Unforeseen',  range: '00',    low: 100, high: 100 },
];

// ---------------------------------------------------------------------------
// Character data types
// ---------------------------------------------------------------------------

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
	/** @deprecated Moved to the Touched asset card's customValues.touchedLevel — kept for old-save migration. */
	touched?: TouchedLevel;
	/** @deprecated Moved to the Touched asset card's customValues.animalName — kept for old-save migration. */
	touchedAnimal?: string;

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
	vows:   Vow[];
	assets: CharacterAsset[];
}

// ---------------------------------------------------------------------------
// Asset catalogue types
// ---------------------------------------------------------------------------

export type AssetCategory = 'Combat Talent' | 'Companion' | 'Path' | 'Ritual' | 'Touched';

/** One option in a custom select field on an asset card. */
export interface CustomFieldOption {
	value: string;
	label: string;
}

/**
 * Declares a custom input field on an asset definition.
 * Values are stored in `CharacterAsset.customValues` keyed by `field.key`.
 */
export interface CustomFieldDef {
	key:          string;
	type:         'select' | 'text';
	label:        string;
	options?:     CustomFieldOption[];  // required when type === 'select'
	placeholder?: string;              // hint text for type === 'text'
	default?:     string;              // initial value
}

export interface AssetAbility {
	enabled: boolean;
	text:    string;
	name?:   string;
	/** Move IDs referenced in this ability's text (e.g. ["move/strike", "move/clash"]). */
	moves?:  string[];
}

export interface AssetDefinition {
	id:                  string;
	name:                string;
	category:            AssetCategory;
	summary?:            string;
	preamble?:           string;
	postamble?:          string;
	abilities:           AssetAbility[];
	touchedFeatures?:    boolean;
	/**
	 * Maximum counter value. A plain number is static; an array of numbers maps one-to-one
	 * onto the asset's abilities — the effective max is the value at the index of the highest
	 * currently-enabled ability (e.g. [3, 6, 6] for a simulacrum whose health rises from 3 → 6
	 * when ability 1 is unlocked).
	 */
	counterMax?:         number | number[];
	/** Initial counter value when the asset is first added. Defaults to 0 if omitted. */
	counterStart?:       number;
	counterLabel?:       string;
	/** Overrides the category colour for the counter badge and pips. Accepts any CSS value. */
	counterColor?:       string;
	/** Canonical icon name for the counter badge (e.g. "heart", "skull-and-crossbones"). */
	counterIcon?:        string;
	/** If present, renders one text input per entry (e.g. ["Companion Name"] or ["God's Name", "Stat"]). */
	nameLabels?:         string[];
	/** If present, renders mutually-exclusive radio buttons side by side (e.g. Ironclad armor choice). */
	radioLabels?:        string[];
	/** If present, renders custom input fields (select, text) in the asset body. Values stored in asset.customValues. */
	customFields?:       CustomFieldDef[];
	[key: string]:       unknown;
}

export interface RarityDefinition {
	id:          string;
	name:        string;
	assetId:     string;   // the asset this rarity belongs to (1-to-1)
	xpCost:      number;   // typically 3, 4, or 5
	description: string;
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
	vows:   [],
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
