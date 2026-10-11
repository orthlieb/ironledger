// =============================================================================
// Settlement kit — a recipe's plain fallback icon
//
// Kept apart from generate.js (and so from the kit and clipper-lib) so the
// marker editor can import it without pulling the generator into the main
// bundle; the generator itself only loads in the settlement worker.
// =============================================================================

/** @typedef {import('./generate.js').SettlementRecipe} SettlementRecipe */

/** The baked core icon nearest each Buildings-tab building (by slug). */
const BUILDING_ICONS = /** @type {Record<string, string>} */ ({
	'gable-house': 'house',
	'side-house': 'cabin',
	'round-tower': 'tower-flag',
	'bell-tower': 'clocktower',
	church: 'church',
	keep: 'keep',
	market: 'medieval-pavilion',
	longhouse: 'viking-longhouse',
	windmill: 'windmill',
	townhouse: 'townhouse',
	barn: 'barn',
	tavern: 'tavern',
	barracks: 'medieval-barracks',
	'water-mill': 'water-mill',
	mine: 'mine',
	well: 'well',
	lighthouse: 'lighthouse',
	caravel: 'harbor-dock',
	warehouse: 'warehouse',
	workshop: 'factory',
	cathedral: 'cathedral',
	'clock-tower': 'clocktower',
	tent: 'camping-tent',
	pavilion: 'medieval-pavilion',
	gatehouse: 'medieval-gate',
	'wooden-gate': 'wooden-gate',
	'witch-hut': 'witches-hut',
	wall: 'stone-wall',
	'wall-tower': 'defensive-wall',
	palisade: 'palisade',
	dock: 'harbor-dock',
	pier: 'wooden-pier',
});

/** Ruins of the buildings that have one baked. @type {Record<string, string>} */
const BUILDING_RUINS = {
	'gable-house': 'house-ruin',
	'side-house': 'house-ruin',
	townhouse: 'house-ruin',
	tavern: 'tavern-ruin',
	cathedral: 'cathedral-ruin',
	keep: 'castle-ruin',
	mine: 'mine-ruin',
	'round-tower': 'fortified-tower-ruin',
	wall: 'broken-wall',
	'wall-tower': 'broken-wall',
};

/**
 * The plain core icon a recipe falls back to — drawn by older clients, entity
 * chips, and while the custom settlement is still generating.
 * @param {SettlementRecipe} recipe
 * @returns {string} manifest key, e.g. "settlement/town"
 */
export function fallbackIcon(recipe) {
	const ruined = !!recipe.ruin;
	if (recipe.building)
		return `settlement/${(ruined && BUILDING_RUINS[recipe.building]) || BUILDING_ICONS[recipe.building] || 'house'}`;
	switch (recipe.tier) {
		case 'stead':
			return ruined ? 'settlement/house-ruin' : 'settlement/family-house';
		case 'camp':
			return 'settlement/camp';
		case 'outpost':
			return 'settlement/military-fort';
		case 'hamlet':
		case 'village':
			return ruined ? 'settlement/village-ruin' : 'settlement/village';
		case 'hold':
			return ruined ? 'settlement/castle-ruin' : 'settlement/castle';
		case 'town':
			return ruined ? 'settlement/town-ruin' : 'settlement/town';
		case 'city':
			return ruined ? 'settlement/town-ruin' : 'settlement/small-city';
		default:
			return ruined ? 'settlement/town-ruin' : 'settlement/large-city';
	}
}
