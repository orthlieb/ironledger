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
	/** Free-form session notes (mini markdown: **bold**, *italic*, # headings, - lists). */
	notes?: string;
}

export interface CharacterAsset {
	assetId: string;
	abilities: boolean[]; // enabled flags per ability
	rarityId?: string;
	/** Keys of selected items from a definition's selectable list (e.g. cantrips) */
	selections?: string[];
	/** Values for customFields entries, keyed by field.id. Counters stored as numeric strings. */
	customValues?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Foe catalogue types
// ---------------------------------------------------------------------------

export type FoeNature = 'Ironlander' | 'Firstborn' | 'Animal' | 'Beast' | 'Horror' | 'Anomaly' | 'Construct';
export type FoeQuantity = 'solo' | 'pack' | 'horde';

/** Catalogue source / expansion tag (duplicated from @ironledger/shared for client-only use). */
export type CatalogueSource = 'base' | 'delve' | 'yrt';

export interface FoeDef {
	id:          string;      // "ironsworn/basilisk"
	name:        string;
	rank:        1 | 2 | 3 | 4 | 5;
	nature:      FoeNature;
	source?:     CatalogueSource;
	/**
	 * Portrait filenames relative to /foes/, primary first. Pickers and
	 * thumbnails use images[0]; the lightbox carousel cycles through all
	 * entries. When missing, the UI falls back to /foes/<slug>.webp.
	 */
	images?:     string[];
	features:    string[];
	drives:      string[];
	tactics:     string[];
	description: string;
	/** Optional icon override — slug of an SVG in $lib/icons/ (e.g.
	 *  "wolf-pup"). Falls back to the nature icon when absent. */
	icon?:       string;
	/** If true, this foe's harm escalates during combat (YRT extension). */
	escalates?:         boolean;
	/** If true, this foe has an escalating grey-mana defense shield (YRT extension). */
	escalatesDefense?:  boolean;
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
	/** Current escalating harm level (ticks). Only meaningful when foeDef.escalates is true. */
	currentHarm?:    number;
	/** Current escalating defense level (ticks). Only meaningful when foeDef.escalatesDefense is true.
	 *  Absent = full defense (cap). Starts at cap and decreases by 1 on each miss. */
	currentDefense?: number;
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
	imageUrl?:  string;          // base64 JPEG data URL
	createdAt?: number;          // Date.now() on creation
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
	notes:      string;          // freeform markdown notes
	theme:      DelveTheme | '';
	domain:     DelveDomain | '';
	difficulty: ExpeditionDifficulty;
	ticks:      number;          // 0–40 (10 boxes × 4 ticks)
	denizens:       string[];        // length 12 — one per DENIZEN_CELLS row
	complete:       boolean;
	currentFeature?: string;        // last rolled feature result
	currentDanger?:  string;        // last rolled danger result
	imageUrl?:  string;          // base64 JPEG data URL
	createdAt?: number;          // Date.now() on creation
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
	/** Values for global counters (field.global === true), keyed by field.id. */
	globalValues?: Record<string, string>;

	// Progress
	xp: number;       // 0–30
	bonds: number;    // 0–40
	failures: number; // 0–40
	/** Notes beneath the Bonds track — significant bonds formed. Markdown. */
	bondsFormed?: string;
	/** Notes beneath the Failures track — what the character learned from their failures. Markdown. */
	lessonsLearned?: string;

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

	// Combat state
	/** 0 = no initiative, 1 = character has initiative, 2 = foe has initiative. */
	initiative?: number;
}

// ---------------------------------------------------------------------------
// Asset catalogue types
// ---------------------------------------------------------------------------

export type AssetCategory = 'Combat Talent' | 'Companion' | 'Path' | 'Ritual' | 'Touched';

/** One option in a radio or dropdown custom field on an asset card. */
export interface CustomFieldOption {
	id:    string;
	label: string;
}

/**
 * Declares a custom input field on an asset definition.
 * Values are stored in `CharacterAsset.customValues` keyed by `field.id`.
 *
 * Types:
 *   string   — free-text input (optional placeholder)
 *   counter  — numeric pip tracker (maxValue, optional icon)
 *   radio    — mutually-exclusive buttons (options required)
 *   dropdown — select menu (options required)
 *   switch   — boolean on/off toggle
 *
 * position: 'top' renders before the preamble; 'bottom' renders after abilities.
 * default: initial value (string for string/radio/dropdown/switch; number for counter).
 */
export interface CustomFieldDef {
	id:           string;
	type:         'string' | 'counter' | 'radio' | 'dropdown' | 'switch' | 'markdown';
	label:        string;
	/** Short label shown as a pill in the Global Context Bar (omit to hide from GCB). */
	shortLabel?:  string;
	/** Tooltip text shown on hover in the Global Context Bar (falls back to asset def.name). */
	tooltipLabel?: string;
	position?:    'top' | 'bottom';          // default 'top'
	default?:     string | number;
	// string
	placeholder?: string;
	// counter
	maxValue?:    number | number[];          // array = per-ability-level
	icon?:        string;
	/** If true, all counter fields with the same id share one value across the character (e.g. supply). */
	global?:      boolean;
	// radio | dropdown
	options?:     CustomFieldOption[];
}

export interface AssetAbility {
	enabled: boolean;
	text:    string;
	name?:   string;
	/** Move IDs referenced in this ability's text (e.g. ["move/strike", "move/clash"]). */
	moves?:  string[];
}

export interface AssetDefinition {
	id:           string;
	name:         string;
	category:     AssetCategory;
	source?:      CatalogueSource;
	/** Optional icon override — slug of an SVG in $lib/icons/ (e.g.
	 *  "asset-wayfinder"). Falls back to the category icon when absent. */
	icon?:        string;
	summary?:     string;
	preamble?:    string;
	postamble?:   string;
	abilities:    AssetAbility[];
	/** If true, asset uses the touchedFeatures panel in the card body. */
	touchedFeatures?: boolean;
	/** Custom input fields rendered in the asset body. Values stored in asset.customValues keyed by field.id. */
	customFields?:    CustomFieldDef[];
	/**
	 * If set, only one asset with this group value may be owned at a time.
	 * Attempting to add a second will be blocked with a user-facing message.
	 */
	exclusiveGroup?: string;
	/**
	 * Maps a dropdown customField id → option value → maximum enabled ability count.
	 * e.g. { touchedLevel: { pure: 0, prime: 1, second: 2, third: 3, feral: 3 } }
	 * When the selected level changes downward the excess abilities are cleared.
	 */
	abilityMaxByField?: Record<string, Record<string, number>>;
	[key: string]:    unknown;
}

export interface RarityDefinition {
	id:          string;
	name:        string;
	assetId:     string;   // the asset this rarity belongs to (1-to-1)
	source?:     CatalogueSource;
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
	globalValues: {},
	xp: 0,
	bonds: 0,
	failures: 0,
	bondsFormed: '',
	lessonsLearned: '',
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

// ---------------------------------------------------------------------------
// Community types (regions + standalone NPCs)
// ---------------------------------------------------------------------------

export type NpcRelationship = 'neutral' | 'bond' | 'foe';

/** @deprecated Legacy NPC type embedded in communities. Kept for data migration only. */
export interface CommunityNpc {
	id:           string;
	name:         string;
	role:         string;
	goal:         string;
	descriptor:   string;
	relationship: NpcRelationship;
	notes:        string;
}

export interface Community {
	id:                  string;
	name:                string;
	region:              string;
	location:            string;
	locationDescription: string;
	trouble:             string;
	notes:               string;
	imageUrl?:           string;   // base64 JPEG data URL
	createdAt?:          number;   // Date.now() on creation
}

export interface Npc {
	id:           string;
	name:         string;
	role:         string;
	goal:         string;
	descriptor:   string;
	relationship: NpcRelationship;
	location:     string;
	notes:        string;
	imageUrl?:    string;   // base64 JPEG data URL
	createdAt?:   number;   // Date.now() on creation
}

// ---------------------------------------------------------------------------

// Ticks earned per Mark Progress action by difficulty
export const VOW_MARK_TICKS: Record<VowDifficulty, number> = {
	troublesome: 12,
	dangerous: 8,
	formidable: 4,
	extreme: 2,
	epic: 1,
};
