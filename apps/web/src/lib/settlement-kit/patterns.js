// =============================================================================
// Settlement kit — wall patterns
//
// Material-specific repeating fills for wall-roled pieces. Baked into every
// generated SVG as <pattern> elements in <defs>; the wall polygon then uses
// fill="url(#pat-wall-stone)" (etc.) in place of a flat colour. This saves
// Clipper the work of unioning dozens of brick-course lines per piece
// (stone wall icon baker: 60 s → 290 s → down to ~130 s again when the
// brick lines move here), and lets us give hedge and reef a readable body
// texture they lacked entirely.
//
// A pattern definition is purely a string producer: given a fill colour
// (the wall body) and an ink colour (seams/joints/leaves), it returns the
// contents of a <pattern> element — not the <pattern> wrapper itself,
// which `defsFor()` adds along with its id, size, and patternUnits.
//
// IMPORTANT: colours are baked into the pattern string at output time.
// Each render of an icon that uses a different palette needs its own
// pattern defs. Pattern ids are suffixed per render (via `scope`) so two
// icons on the same page don't collide.
// =============================================================================

/**
 * @typedef {object} PatternDef
 * @property {number} w tile width in world units
 * @property {number} h tile height in world units
 * @property {(fill: string, ink: string) => string} body inner XML for the
 *   `<pattern>` element (`<rect>`, `<path>`, `<circle>` …), with colours
 *   baked in
 */

// Pattern bodies use CSS vars with hex fallbacks via style= — the var()
// kicks in when the pattern is rendered inside a document that sets
// `--wall` / `--ink` (the playground), while the hex fallback keeps every
// standalone-view path working (a baked SVG opened in a browser, an <img>
// src attribute, a markdown preview). Vars don't resolve from the role
// name, so this encodes the right var for each pattern type.

/** @param {string} fill wall-body hex (fallback)
 *  @returns {string} */
const wallVar = (fill) => `var(--wall-pat, var(--wall, ${fill}))`;
/** @param {string} ink ink hex (fallback)
 *  @returns {string} */
const inkVar = (ink) => `var(--ink, ${ink})`;

/** Running-bond brick: offset courses, one horizontal line per course and
 *  staggered vertical joints. The stroke is 0.3 world units to match the
 *  rest of the kit's hairline details at marker size. */
/** @type {PatternDef} */
const stone = {
	w: 4.4,
	h: 4.8,
	body: (fill, ink) =>
		`<rect width="4.4" height="4.8" style="fill:${wallVar(fill)}"/>` +
		`<path style="stroke:${inkVar(ink)};stroke-width:0.3;fill:none" d="` +
		// Horizontal courses at y=0 and y=2.4
		'M0 0h4.4M0 2.4h4.4' +
		// Vertical joints: course 0 at x=0, 4.4; course 1 at x=2.2
		'M0 0v2.4M4.4 0v2.4M2.2 2.4v2.4' +
		'"/>',
};

/** Dense hedge: a stipple of small overlapping circles in ink at half
 *  opacity so the hedge reads as a textured mass rather than a flat
 *  silhouette. Tile is roughly square so it works on both horizontal and
 *  vertical faces. */
/** @type {PatternDef} */
const hedge = {
	w: 5,
	h: 5,
	body: (fill, ink) =>
		`<rect width="5" height="5" style="fill:${wallVar(fill)}"/>` +
		`<g style="fill:${inkVar(ink)};fill-opacity:0.42">` +
		'<circle cx="1.1" cy="1.2" r="0.9"/>' +
		'<circle cx="3.4" cy="0.7" r="0.75"/>' +
		'<circle cx="4.5" cy="2.4" r="0.85"/>' +
		'<circle cx="2.4" cy="2.6" r="0.7"/>' +
		'<circle cx="0.4" cy="3.4" r="0.8"/>' +
		'<circle cx="3.7" cy="4.1" r="0.9"/>' +
		'<circle cx="1.7" cy="4.5" r="0.75"/>' +
		'</g>',
};

/** Reef / coral: lightly stippled with tiny branched specks suggesting
 *  calcified polyps and bits of broken coral. Darker and sparser than
 *  hedge so it reads as rock rather than foliage. */
/** @type {PatternDef} */
const reef = {
	w: 6,
	h: 6,
	body: (fill, ink) =>
		`<rect width="6" height="6" style="fill:${wallVar(fill)}"/>` +
		`<g style="fill:${inkVar(ink)};fill-opacity:0.55">` +
		// Short branched specks (plus-sign shapes to suggest coral)
		'<path d="M1.1 1.6l0.1 -1 0.2 1 1 0.1-1 0.2-0.1 1-0.2-1-1-0.2z"/>' +
		'<path d="M4.3 0.8l0.1 -0.8 0.2 0.8 0.8 0.1-0.8 0.2-0.1 0.8-0.2-0.8-0.8-0.2z"/>' +
		'<circle cx="2.6" cy="2.6" r="0.4"/>' +
		'<path d="M5 3.6l0.1 -1 0.2 1 1 0.1-1 0.2-0.1 1-0.2-1-1-0.2z"/>' +
		'<circle cx="0.8" cy="4.1" r="0.5"/>' +
		'<path d="M3.3 4.6l0.1 -0.8 0.2 0.8 0.8 0.1-0.8 0.2-0.1 0.8-0.2-0.8-0.8-0.2z"/>' +
		'<circle cx="5.2" cy="5.5" r="0.4"/>' +
		'</g>',
};

/** @type {Record<string, PatternDef>} */
export const PATTERNS = {
	'wall-stone': stone,
	'wall-stone-shade': stone,
	'wall-hedge': hedge,
	'wall-hedge-shade': hedge,
	'wall-reef': reef,
	'wall-reef-shade': reef,
};

/** Role names of walls that use a pattern fill (both base and -shade). */
export const PATTERN_ROLES = new Set(Object.keys(PATTERNS));

/**
 * Build a `<defs>` fragment with the patterns the icon needs. `scope` is
 * suffixed on each pattern id so two icons in the same document don't
 * collide; pass a stable per-icon string (slug, cache key).
 * @param {Iterable<string>} usedRoles roles actually referenced in the icon
 * @param {(role: string) => {fill: string, ink: string}} coloursFor map a
 *   pattern role to its wall-colour fill + ink colour
 * @param {string} scope unique-ish per icon
 * @returns {{defs: string, url: (role: string) => string}}
 */
export function patternDefs(usedRoles, coloursFor, scope) {
	const roles = [...new Set(usedRoles)].filter((r) => PATTERN_ROLES.has(r));
	if (!roles.length) return { defs: '', url: () => '' };
	const id = (/** @type {string} */ role) => `pat-${role}-${scope}`;
	const defs = roles
		.map((role) => {
			const p = PATTERNS[role];
			const { fill, ink } = coloursFor(role);
			return (
				`<pattern id="${id(role)}" width="${p.w}" height="${p.h}" ` +
				`patternUnits="userSpaceOnUse">${p.body(fill, ink)}</pattern>`
			);
		})
		.join('');
	return {
		defs: `<defs>${defs}</defs>`,
		url: (role) => (PATTERN_ROLES.has(role) ? `url(#${id(role)})` : ''),
	};
}
