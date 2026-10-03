// =============================================================================
// Settlement kit — a recipe's plain fallback icon
//
// Kept apart from generate.js (and so from the kit and clipper-lib) so the
// marker editor can import it without pulling the generator into the main
// bundle; the generator itself only loads in the settlement worker.
// =============================================================================

/** @typedef {import('./generate.js').SettlementRecipe} SettlementRecipe */

/**
 * The plain core icon a recipe falls back to — drawn by older clients, entity
 * chips, and while the custom settlement is still generating.
 * @param {SettlementRecipe} recipe
 * @returns {string} manifest key, e.g. "settlement/town"
 */
export function fallbackIcon(recipe) {
	const ruined = !!recipe.ruin;
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
