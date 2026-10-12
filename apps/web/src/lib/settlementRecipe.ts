// =============================================================================
// Iron Ledger — settlement recipes on map markers.
//
// A marker with a generated settlement icon stores a RECIPE: a reference to
// a culture plugin (by key) plus the builder's knobs. Never the culture
// itself — the culture definition lives in an extension's cultures/*.json
// and is looked up at draw time (missing → the default culture). The marker
// also keeps a plain `icon` (fallbackIcon(recipe)) for entity chips, older
// clients and the moment before the custom icon is drawn.
//
// The generator's own JSDoc type (settlement-kit/generate.js
// SettlementRecipe) is the same shape; this file owns the TS type and the
// import-time validation.
// =============================================================================

export const SETTLEMENT_TIERS = [
	'stead',
	'camp',
	'outpost',
	'hamlet',
	'village',
	'hold',
	'town',
	'city',
	'capital',
	'freeport',
] as const;
export type SettlementTier = (typeof SETTLEMENT_TIERS)[number];

export const SETTLEMENT_WALLS = [
	'auto',
	'none',
	'stone',
	'palisade',
	'earth',
	'hedge',
	'bone',
	'reef',
] as const;
export type SettlementWalls = (typeof SETTLEMENT_WALLS)[number];

/** The Choose Icon dialog's Buildings tab: each single building it offers
 *  (settlement-kit layouts3d.js BUILDINGS), key → label, in menu order. The
 *  kit's RETIRED_BUILDINGS aren't here: a marker that already has one still
 *  draws it, but a recipe naming one is no longer accepted on import. */
export const SETTLEMENT_BUILDINGS = {
	'gable-house': 'Gable house',
	'side-house': 'Side house',
	'round-tower': 'Round tower',
	'bell-tower': 'Bell tower',
	church: 'Church',
	keep: 'Keep',
	market: 'Market',
	longhouse: 'Longhouse',
	windmill: 'Windmill',
	townhouse: 'Townhouse',
	barn: 'Barn',
	tavern: 'Tavern',
	barracks: 'Barracks',
	'water-mill': 'Water mill',
	mine: 'Mine',
	well: 'Well',
	lighthouse: 'Lighthouse',
	warehouse: 'Warehouse',
	workshop: 'Workshop',
	cathedral: 'Cathedral',
	'clock-tower': 'Clock tower',
	tent: 'Tent',
	pavilion: 'Pavilion',
	'witch-hut': 'Witch hut',
	wall: 'Wall',
} as const;
export type SettlementBuilding = keyof typeof SETTLEMENT_BUILDINGS;

/** Buildings never given a wall of their own, so no Walls or Wall shape:
 *  the wall buildings, each in its own material, and the harbour pieces.
 *  (settlement-kit layouts3d.js UNWALLED_BUILDINGS; a test holds them in
 *  step.) */
export const UNWALLED_BUILDINGS: ReadonlySet<string> = new Set([
	'wall',
	'wall-tower',
	'palisade',
	'gatehouse',
	'wooden-gate',
	'caravel',
	'dock',
	'pier',
]);

/** What a settlement or building stands on (Design.ground): 'none' draws no
 *  ground; the rest a plane under it in their own colour and texture; water
 *  a lagoon. ('land' is the old name for 'none': cleanSettlementRecipe()
 *  turns it into 'none', and the generator draws it as none.) */
export const SETTLEMENT_GROUNDS = [
	'none',
	'dirt',
	'grass',
	'farmland',
	'sand',
	'rock',
	'snow',
	'ice',
	'marsh',
	'lava',
	'water',
] as const;
export type SettlementGround = (typeof SETTLEMENT_GROUNDS)[number];

export interface SettlementRecipe {
	tier: SettlementTier;
	/** Culture plugin key, e.g. "elves" or "nysis". */
	culture: string;
	/** Layout seed — the same recipe always draws the same icon. */
	seed: number;
	walls?: SettlementWalls;
	wallShape?: 'round' | 'square';
	/** Override the culture's own `ground`: what the whole icon stands on. */
	ground?: SettlementGround;
	/** Lift every building onto a timber-post deck (over water or sand). */
	stilts?: boolean;
	harbor?: boolean;
	/** A hex tile behind the icon, as a hex map's cell frames it: the ground
	 *  in a hexagon's shape, or a dashed hexagon with no ground. */
	hex?: boolean;
	/** A ruin: how far gone (0–1), and whether it burned (scorch, soot). */
	ruin?: { decay: number; burned?: boolean };
	/** One building instead of a settlement (the Buildings tab). `walls` then
	 *  puts a wall of its own round it (never round UNWALLED_BUILDINGS), and
	 *  `tier`, `stilts` and `harbor` don't apply. */
	building?: SettlementBuilding;
}

const TIER_LABEL: Record<string, string> = {
	stead: 'Stead',
	camp: 'Camp',
	outpost: 'Outpost',
	hamlet: 'Hamlet',
	village: 'Village',
	hold: 'Hold',
	town: 'Town',
	city: 'City',
	capital: 'Capital',
	freeport: 'Freeport',
};

/** Human label for a recipe, e.g. "Ruined Nysis Town" or "Elves Round
 *  tower, walled". */
export function recipeLabel(
	recipe: SettlementRecipe,
	culture: { name: string } | null | undefined,
): string {
	const name = culture?.name ?? 'Ironlander';
	const state = recipe.ruin ? (recipe.ruin.burned ? 'Burned ' : 'Ruined ') : '';
	const b = recipe.building;
	if (b) {
		const walled =
			recipe.walls &&
			recipe.walls !== 'none' &&
			recipe.walls !== 'auto' &&
			!UNWALLED_BUILDINGS.has(b);
		return `${state}${name} ${SETTLEMENT_BUILDINGS[b] ?? b}${walled ? ', walled' : ''}`;
	}
	return `${state}${name} ${TIER_LABEL[recipe.tier] ?? recipe.tier}`;
}

/** Stable cache key for a recipe (field order fixed). */
export function recipeKey(r: SettlementRecipe): string {
	return [
		r.tier,
		r.culture,
		r.seed,
		r.walls ?? '',
		r.wallShape ?? '',
		r.ground ?? '',
		r.stilts ? 's' : '',
		r.harbor ? 'h' : '',
		r.ruin ? r.ruin.decay.toFixed(2) + (r.ruin.burned ? 'b' : '') : '',
		r.building ?? '',
		r.hex ? 'x' : '',
	].join('|');
}

/** Two recipes draw the same icon. */
export function sameRecipe(a: SettlementRecipe, b: SettlementRecipe): boolean {
	return recipeKey(a) === recipeKey(b);
}

/**
 * Validate an imported / hand-edited recipe. Anything malformed → undefined
 * (the marker then just shows its plain icon), mirroring the server schema.
 */
export function cleanSettlementRecipe(v: unknown): SettlementRecipe | undefined {
	if (!v || typeof v !== 'object') return undefined;
	const o = v as Record<string, unknown>;
	if (!SETTLEMENT_TIERS.includes(o.tier as SettlementTier)) return undefined;
	if (typeof o.culture !== 'string' || !/^[a-z0-9-]{1,64}$/.test(o.culture)) return undefined;
	if (typeof o.seed !== 'number' || !Number.isInteger(o.seed) || o.seed < 0 || o.seed > 1_000_000)
		return undefined;
	const out: SettlementRecipe = {
		tier: o.tier as SettlementTier,
		culture: o.culture,
		seed: o.seed,
	};
	if (SETTLEMENT_WALLS.includes(o.walls as SettlementWalls)) out.walls = o.walls as SettlementWalls;
	if (o.wallShape === 'round' || o.wallShape === 'square') out.wallShape = o.wallShape;
	const ground = o.ground === 'land' ? 'none' : o.ground;
	if (SETTLEMENT_GROUNDS.includes(ground as SettlementGround))
		out.ground = ground as SettlementGround;
	if (o.stilts === true) out.stilts = true;
	if (o.harbor === true) out.harbor = true;
	if (o.hex === true) out.hex = true;
	const ruin = o.ruin as { decay?: unknown; burned?: unknown } | undefined;
	if (ruin && typeof ruin.decay === 'number' && ruin.decay >= 0 && ruin.decay <= 1)
		out.ruin = ruin.burned === true ? { decay: ruin.decay, burned: true } : { decay: ruin.decay };
	if (o.building !== undefined) {
		// An unknown building can't fall back to a settlement — that would
		// draw something else entirely — so the recipe goes.
		if (typeof o.building !== 'string' || !Object.hasOwn(SETTLEMENT_BUILDINGS, o.building))
			return undefined;
		out.building = o.building as SettlementBuilding;
	}
	return out;
}
