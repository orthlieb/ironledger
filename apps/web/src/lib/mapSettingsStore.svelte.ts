// =============================================================================
// Iron Ledger — Map view settings (localStorage-backed)
//
// Per-device display preferences for the campaign map: scale-bar toggle +
// unit + distance-per-cell, grid visibility + opacity, label visibility,
// and restored pan fraction. Deliberately separate from `mapStore`
// (which is server-backed marker data) because these are cosmetic/local
// — moving them server-side is a follow-up if users start wanting
// cross-device parity.
// =============================================================================

const STORAGE_KEY = 'ironledger:mapSettings';

export type ScaleUnit = 'miles' | 'km';

export interface MapSettings {
	scale: {
		/** Show the scale bar overlay. */
		enabled: boolean;
		/** Distance label unit. */
		unit: ScaleUnit;
		/** Real-world distance one base grid cell represents at 100% zoom.
		 *  Stored server-side under `mapState.settings.scale.perHex` for
		 *  backwards compat with the pre-square-grid data — the name still
		 *  reads correctly for the current model. */
		perHex: number;
		/** Number of segments in the scale bar (e.g. `4` = 5 tick marks). */
		segments: number;
	};
	grid: {
		/** Show the translucent grid overlay. Clicks still place markers
		 *  either way — the flag just controls line visibility so markers
		 *  can be placed on an "invisible" grid. */
		visible: boolean;
		/** Grid stroke opacity in `[0, 1]`. Default 0.5 = subtly visible
		 *  over any background; users tune per-map preference. */
		opacity: number;
	};
	pan: {
		/** Fraction of the scrollable area (`scrollLeft / (scrollWidth -
		 *  clientWidth)`), in `[0, 1]`. Stored as a fraction so a
		 *  different-sized canvas on the same device still restores to
		 *  roughly the same spot. Ignored when the canvas isn't
		 *  scrollable (zoom = 1.0). */
		fx: number;
		fy: number;
	};
}

const DEFAULTS: MapSettings = {
	scale: { enabled: false, unit: 'miles', perHex: 5, segments: 4 },
	grid: { visible: true, opacity: 0.5 },
	pan: { fx: 0.5, fy: 0.5 },
};

/** Deep-clone the defaults so users can't accidentally mutate the shared
 *  reference through the reactive proxy. */
function freshDefaults(): MapSettings {
	return {
		scale: { ...DEFAULTS.scale },
		grid: { ...DEFAULTS.grid },
		pan: { ...DEFAULTS.pan },
	};
}

/** Legacy shape carried the same fields under `hexes`, and previously
 *  had a per-device `labels.visible` toggle (now always on). Accept
 *  either legacy key so a stored preference keeps loading through the
 *  square-grid + always-show-labels renames. */
interface LegacyMapSettings {
	scale?: Partial<MapSettings['scale']>;
	grid?: Partial<MapSettings['grid']>;
	hexes?: Partial<MapSettings['grid']>;
	labels?: unknown;
	pan?: Partial<MapSettings['pan']>;
}

function load(): MapSettings {
	if (typeof window === 'undefined') return freshDefaults();
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return freshDefaults();
		const parsed = JSON.parse(raw) as LegacyMapSettings;
		return {
			scale: { ...DEFAULTS.scale, ...(parsed.scale ?? {}) },
			grid: { ...DEFAULTS.grid, ...(parsed.hexes ?? {}), ...(parsed.grid ?? {}) },
			pan: { ...DEFAULTS.pan, ...(parsed.pan ?? {}) },
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
