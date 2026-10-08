// =============================================================================
// Iron Ledger — settlement generator worker.
//
// Runs the settlement kit (clipper-lib polygon booleans — ~0.1 s for a
// village, 1–2 s for a city, several seconds for an ornate freeport) off the
// main thread. One message in, one out:
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
