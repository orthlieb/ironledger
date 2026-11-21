// =============================================================================
// Iron Ledger — a map's marker layers, as plain data
//
// A map's layers live in its settings (`settings.layers`); the default layer
// is always there. A hidden layer's markers aren't drawn on the map, can't be
// picked, and stay out of the Markdown export. The map store applies these to
// the open map; the export applies them to each map it fetches. No Svelte, so
// they're unit-tested.
// =============================================================================

/** A layer markers can be put on, to show or hide them together. */
export interface MapLayer {
	id: string;
	name: string;
	/** Hidden: its markers aren't drawn, and can't be picked. */
	hidden?: boolean;
}

/** The layer every marker without one (or with a deleted one) is on. */
export const DEFAULT_LAYER_ID = 'default';

/**
 * A map's layers, in order, from its saved settings: the default layer first
 * (always there, renamable, never deleted), then the map's own. A
 * hand-edited or imported list is cleaned: rows that aren't layers and
 * repeated ids are dropped, and a blank name reads "Layer".
 */
export function cleanMapLayers(raw: unknown): MapLayer[] {
	const list = Array.isArray(raw) ? (raw as Array<Partial<MapLayer> | null>) : [];
	const seen = new Set<string>();
	const out: MapLayer[] = [];
	for (const l of list) {
		if (!l || typeof l.id !== 'string' || !l.id || seen.has(l.id)) continue;
		seen.add(l.id);
		const name = typeof l.name === 'string' && l.name.trim() ? l.name.trim() : 'Layer';
		out.push({ id: l.id, name, ...(l.hidden === true ? { hidden: true } : {}) });
	}
	const def = out.findIndex((l) => l.id === DEFAULT_LAYER_ID);
	if (def < 0) return [{ id: DEFAULT_LAYER_ID, name: 'Default' }, ...out];
	return [out[def]!, ...out.filter((_, i) => i !== def)];
}

/** A test for whether a marker's layer is shown, built once for a pass over
 *  many markers. A marker on no layer, or a deleted one, is on the default. */
export function layerShownTest(layers: readonly MapLayer[]): (m: { layer?: string }) => boolean {
	const ids = new Set(layers.map((l) => l.id));
	const hidden = new Set(layers.filter((l) => l.hidden).map((l) => l.id));
	return (m) => !hidden.has(m.layer && ids.has(m.layer) ? m.layer : DEFAULT_LAYER_ID);
}
