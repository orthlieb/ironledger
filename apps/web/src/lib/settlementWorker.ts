// =============================================================================
// Iron Ledger — settlement generator worker.
//
// Runs the settlement kit (clipper-lib polygon booleans — tens to hundreds of
// milliseconds for a city) off the main thread. One message in, one out:
//   in:  { id, recipe: SettlementRecipe, culture: Culture | null }
//   out: { id, svg } or { id, error }
// =============================================================================

import { generateSettlementSvg } from './settlement-kit/generate.js';

self.onmessage = (e: MessageEvent) => {
	const { id, recipe, culture } = e.data;
	try {
		self.postMessage({ id, svg: generateSettlementSvg(recipe, culture) });
	} catch (err) {
		self.postMessage({ id, error: String(err) });
	}
};
