// =============================================================================
// Settlement kit — palettes
//
// A culture's eight base colours and the fill each colour role takes from
// them, shared by the generator (generate.js, the icon bake) and the app's
// map renderer (src/lib/mapLayered.ts), so a generated file and a marker
// colour their roles the same way.
// =============================================================================

/**
 * @typedef {{wall: string, roof: string, wood: string, earth: string,
 *   water: string, ink: string, flag: string, halo: string}} Palette
 */

/** Parchment — the default culture's palette. @type {Palette} */
export const PARCHMENT = {
	wall: '#EFEADF',
	roof: '#D9776B',
	wood: '#C9A97C',
	earth: '#94744F',
	water: '#8FB0B8',
	flag: '#4A3B32',
	ink: '#3B2F28',
	halo: '#F4EFE4',
};

/** Mix two `#rrggbb` colours: `t` of `a`, the rest `b`.
 *  @param {string} a @param {string} b @param {number} t */
export function mix(a, b, t) {
	const ch = (/** @type {string} */ h, /** @type {number} */ i) =>
		parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
	const parts = [0, 1, 2].map((i) => Math.round(ch(a, i) * t + ch(b, i) * (1 - t)));
	return '#' + parts.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** How much of the base colour each shaded role keeps (the rest is ink).
 *  Patterned wall roles shade inside their pattern tiles instead. */
export const SHADE_MIX = /** @type {Record<string, number>} */ ({
	'wall-shade': 0.8,
	'wood-shade': 0.75,
	'earth-shade': 0.75,
	'water-shade': 0.8,
	'roof-shade': 0.7,
});

/** Normalise `#rgb` / `#rrggbb[aa]` to `#rrggbb`; anything else → undefined.
 *  @param {string} c */
function toHex6(c) {
	if (/^#[0-9a-fA-F]{3}$/.test(c))
		return (
			'#' +
			c
				.slice(1)
				.split('')
				.map((x) => x + x)
				.join('')
		);
	if (/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(c)) return c.slice(0, 7);
	return undefined;
}

/**
 * Fill colour for every flat role, with `roof` replaced by `roof` when one
 * is given (the marker colour on the map; shaded roofs follow it) — a
 * non-hex colour keeps the palette's. Pattern-filled wall roles draw
 * through their `<pattern>` instead (patterns.js).
 * @param {Palette} p
 * @param {string} [roof]
 * @returns {Record<string, string>}
 */
export function roleColours(p, roof) {
	const r = (roof && toHex6(roof)) ?? p.roof;
	/** @type {Record<string, string>} */
	const base = {
		wall: p.wall,
		roof: r,
		wood: p.wood,
		earth: p.earth,
		water: p.water,
		flag: p.flag,
		ink: p.ink,
		'ink-texture': p.ink,
		sil: p.halo,
	};
	for (const [role, keep] of Object.entries(SHADE_MIX))
		base[role] = mix(/** @type {string} */ (base[role.replace('-shade', '')]), p.ink, keep);
	return base;
}
