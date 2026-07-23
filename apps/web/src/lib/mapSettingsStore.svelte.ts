// =============================================================================
// Iron Ledger — Map view settings (localStorage-backed)
//
// Per-device display preferences for the campaign map: scale-bar toggle +
// unit + distance-per-hex, and checkered-border toggle. Deliberately
// separate from `mapStore` (which is server-backed marker data) because
// these are cosmetic/local — moving them server-side is a follow-up if
// users start wanting cross-device parity.
// =============================================================================

const STORAGE_KEY = 'ironledger:mapSettings';

export type ScaleUnit = 'miles' | 'km';

export interface MapSettings {
	scale: {
		/** Show the scale bar overlay. */
		enabled: boolean;
		/** Distance label unit. */
		unit: ScaleUnit;
		/** Real-world distance one hex represents (e.g. `5` = 5 miles/km). */
		perHex: number;
		/** Number of segments in the scale bar (e.g. `4` = 5 tick marks). */
		segments: number;
	};
	border: {
		/** Show the checkered border around the visible view. */
		enabled: boolean;
	};
	hexes: {
		/** Show the translucent hex grid overlay. Hexes stay clickable
		 *  either way — the flag just controls the stroke visibility so
		 *  markers can be placed on an "invisible" grid. */
		visible: boolean;
	};
}

const DEFAULTS: MapSettings = {
	scale: { enabled: false, unit: 'miles', perHex: 5, segments: 4 },
	border: { enabled: false },
	hexes: { visible: true },
};

/** Deep-clone the defaults so users can't accidentally mutate the shared
 *  reference through the reactive proxy. */
function freshDefaults(): MapSettings {
	return {
		scale: { ...DEFAULTS.scale },
		border: { ...DEFAULTS.border },
		hexes: { ...DEFAULTS.hexes },
	};
}

function load(): MapSettings {
	if (typeof window === 'undefined') return freshDefaults();
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return freshDefaults();
		const parsed = JSON.parse(raw) as Partial<MapSettings>;
		return {
			scale: { ...DEFAULTS.scale, ...(parsed.scale ?? {}) },
			border: { ...DEFAULTS.border, ...(parsed.border ?? {}) },
			hexes: { ...DEFAULTS.hexes, ...(parsed.hexes ?? {}) },
		};
	} catch {
		return freshDefaults();
	}
}

export const mapSettings = $state<MapSettings>(load());

/** Persist the current settings snapshot. Call after every mutation
 *  from the UI — the caller is responsible because `$effect` isn't
 *  usable outside components, and a plain `JSON.stringify` at every
 *  reactive read would be wasteful. */
export function persistMapSettings(): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(mapSettings));
	} catch {
		// Quota exhaustion or private browsing — silently swallow; the
		// setting still lives in-memory for this session.
	}
}
