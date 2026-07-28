// =============================================================================
// Iron Ledger — Map icon manifest generator
//
// Scans apps/web/static/map/<category>/<slug>.svg and emits a TypeScript
// module the app can import to enumerate every available marker icon.
// Subfolders are categories; kebab-case filenames become Title Case labels
// (hanging-spider -> Hanging Spider). Icons at the top level (no category)
// go into an implicit "misc" bucket.
//
// The inner SVG content is inlined into the manifest and stripped of any
// hardcoded `fill=`/`style="fill:…"` so the marker's chosen color takes
// effect at render time via a wrapping `<g fill={color}>`. Icons that use
// `stroke` are left alone — those keep their own outlines.
//
// Run automatically before `vite dev`/`vite build` (see the Vite plugin
// in vite.config.ts) and also on filesystem changes to static/map/ during
// dev. Safe to re-run: writes only when the output differs.
// =============================================================================

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
// svg-path-bounds ships no TypeScript declarations; the exported default
// is `(pathD: string) => [left, top, right, bottom]`.
// @ts-expect-error — untyped module, treated as any
import pathBounds from 'svg-path-bounds';

/**
 * @typedef {{slug: string, label: string, category: string, categoryLabel: string, viewBox: string, inner: string}} MapIconRow
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = dirname(HERE);
const ICON_ROOT = join(WEB_ROOT, 'static', 'map');
const OUT_PATH = join(WEB_ROOT, 'src', 'lib', 'generated', 'mapIconManifest.ts');

/** Walk a directory recursively, yielding absolute .svg paths.
 * @param {string} dir
 * @returns {string[]}
 */
function walkSvgs(dir) {
	if (!existsSync(dir)) return [];
	/** @type {string[]} */
	const out = [];
	for (const entry of readdirSync(dir)) {
		const p = join(dir, entry);
		const s = statSync(p);
		if (s.isDirectory()) out.push(...walkSvgs(p));
		else if (s.isFile() && entry.toLowerCase().endsWith('.svg')) out.push(p);
	}
	return out;
}

/** hanging-spider -> Hanging Spider; snake_case -> Snake Case.
 * @param {string} slug
 * @returns {string}
 */
function titleCase(slug) {
	return slug
		.replace(/[_-]+/g, ' ')
		.split(' ')
		.filter(Boolean)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');
}

/**
 * Compute a tight bounding box for every <path>, <circle>, <rect>,
 * <ellipse>, <polygon>, <polyline>, and <line> in the inner SVG. Returns
 * null if no shape had a computable box (unusual — icons should always
 * have at least one path). Ignores stroke width; icons are drawn as
 * filled solids in this codebase.
 * @param {string} inner
 * @returns {{x: number, y: number, w: number, h: number} | null}
 */
function computeTightBounds(inner) {
	let x0 = Infinity;
	let y0 = Infinity;
	let x1 = -Infinity;
	let y1 = -Infinity;

	/** @param {number} l @param {number} t @param {number} r @param {number} b */
	function extend(l, t, r, b) {
		if (l < x0) x0 = l;
		if (t < y0) y0 = t;
		if (r > x1) x1 = r;
		if (b > y1) y1 = b;
	}

	// <path d="...">
	for (const m of inner.matchAll(/<path\b[^>]*\sd\s*=\s*"([^"]+)"/gi)) {
		try {
			const [l, t, r, b] = pathBounds(m[1]);
			if (Number.isFinite(l)) extend(l, t, r, b);
		} catch {
			/* unparseable path — skip */
		}
	}
	// <circle cx cy r>
	for (const m of inner.matchAll(/<circle\b([^>]*)>/gi)) {
		const attrs = m[1];
		const cx = parseFloat(attrs.match(/\bcx\s*=\s*"([^"]+)"/i)?.[1] ?? '0');
		const cy = parseFloat(attrs.match(/\bcy\s*=\s*"([^"]+)"/i)?.[1] ?? '0');
		const r = parseFloat(attrs.match(/\br\s*=\s*"([^"]+)"/i)?.[1] ?? '0');
		if (Number.isFinite(cx + cy + r) && r > 0) extend(cx - r, cy - r, cx + r, cy + r);
	}
	// <rect x y width height>
	for (const m of inner.matchAll(/<rect\b([^>]*)>/gi)) {
		const attrs = m[1];
		const x = parseFloat(attrs.match(/\bx\s*=\s*"([^"]+)"/i)?.[1] ?? '0');
		const y = parseFloat(attrs.match(/\by\s*=\s*"([^"]+)"/i)?.[1] ?? '0');
		const w = parseFloat(attrs.match(/\bwidth\s*=\s*"([^"]+)"/i)?.[1] ?? '0');
		const h = parseFloat(attrs.match(/\bheight\s*=\s*"([^"]+)"/i)?.[1] ?? '0');
		if (Number.isFinite(x + y + w + h) && w > 0 && h > 0) extend(x, y, x + w, y + h);
	}
	// <ellipse cx cy rx ry>
	for (const m of inner.matchAll(/<ellipse\b([^>]*)>/gi)) {
		const attrs = m[1];
		const cx = parseFloat(attrs.match(/\bcx\s*=\s*"([^"]+)"/i)?.[1] ?? '0');
		const cy = parseFloat(attrs.match(/\bcy\s*=\s*"([^"]+)"/i)?.[1] ?? '0');
		const rx = parseFloat(attrs.match(/\brx\s*=\s*"([^"]+)"/i)?.[1] ?? '0');
		const ry = parseFloat(attrs.match(/\bry\s*=\s*"([^"]+)"/i)?.[1] ?? '0');
		if (Number.isFinite(cx + cy + rx + ry) && rx > 0 && ry > 0)
			extend(cx - rx, cy - ry, cx + rx, cy + ry);
	}
	// <polygon points="x,y x,y …"> and <polyline points="…">
	for (const m of inner.matchAll(/<(?:polygon|polyline)\b[^>]*\spoints\s*=\s*"([^"]+)"/gi)) {
		const nums = m[1]
			.split(/[\s,]+/)
			.map(parseFloat)
			.filter(Number.isFinite);
		for (let i = 0; i + 1 < nums.length; i += 2) extend(nums[i], nums[i + 1], nums[i], nums[i + 1]);
	}
	// <line x1 y1 x2 y2>
	for (const m of inner.matchAll(/<line\b([^>]*)>/gi)) {
		const attrs = m[1];
		const x1n = parseFloat(attrs.match(/\bx1\s*=\s*"([^"]+)"/i)?.[1] ?? '0');
		const y1n = parseFloat(attrs.match(/\by1\s*=\s*"([^"]+)"/i)?.[1] ?? '0');
		const x2n = parseFloat(attrs.match(/\bx2\s*=\s*"([^"]+)"/i)?.[1] ?? '0');
		const y2n = parseFloat(attrs.match(/\by2\s*=\s*"([^"]+)"/i)?.[1] ?? '0');
		if (Number.isFinite(x1n + y1n + x2n + y2n)) {
			extend(Math.min(x1n, x2n), Math.min(y1n, y2n), Math.max(x1n, x2n), Math.max(y1n, y2n));
		}
	}

	if (!Number.isFinite(x0)) return null;
	return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Format a number for use in a viewBox: up to 3 decimals, trailing zeros
 *  trimmed. Keeps the emitted TS compact.
 * @param {number} n
 * @returns {string}
 */
function fmtNum(n) {
	return Number(n.toFixed(3)).toString();
}

/**
 * Extract the inner content of an <svg> element and its viewBox. Strips
 * `fill="…"` / `style="fill:…"` from every child so the wrapper color
 * takes effect. Leaves `stroke` untouched. Recomputes the viewBox to a
 * tight bounding box around the actual shapes so icons authored with
 * generous padding (e.g. a 640×640 FA sheet with a small glyph inset in
 * the middle) render edge-to-edge in fixed-size icon slots instead of
 * appearing tiny with wasted transparent margin.
 * @param {string} source
 * @returns {{viewBox: string, inner: string}}
 */
function parseSvg(source) {
	// Grab the viewBox off the outer <svg>; fall back to 0 0 24 24.
	const vbMatch = source.match(/<svg\b[^>]*\sviewBox\s*=\s*"([^"]+)"/i);
	let viewBox = vbMatch ? vbMatch[1] : '0 0 24 24';
	// Extract everything between the outer <svg …> and </svg>.
	const bodyMatch = source.match(/<svg\b[^>]*>([\s\S]*)<\/svg>/i);
	let inner = bodyMatch ? bodyMatch[1] : '';
	// Strip attribute-style fills and inline `fill:` in style attrs. Keep
	// `fill="none"` so it isn't re-filled by the wrapper color.
	inner = inner
		.replace(/\sfill\s*=\s*"(?!none")[^"]*"/gi, '')
		.replace(/\sfill\s*=\s*'(?!none')[^']*'/gi, '')
		.replace(
			/style\s*=\s*"([^"]*)"/gi,
			(/** @type {string} */ _m, /** @type {string} */ styles) => {
				const cleaned = styles
					.split(';')
					.map((/** @type {string} */ s) => s.trim())
					.filter((/** @type {string} */ s) => s && !/^fill\s*:/i.test(s))
					.join(';');
				return cleaned ? `style="${cleaned}"` : '';
			},
		);
	// Collapse whitespace so the emitted TS is tidy.
	inner = inner.replace(/\s+/g, ' ').trim();
	// Tighten the viewBox to the actual drawn extents so icons authored
	// with slack padding fill their render slot. Fall back to the source
	// viewBox if no shape parsed (e.g. an all-text or unsupported-tag SVG).
	const tight = computeTightBounds(inner);
	if (tight && tight.w > 0 && tight.h > 0) {
		viewBox = `${fmtNum(tight.x)} ${fmtNum(tight.y)} ${fmtNum(tight.w)} ${fmtNum(tight.h)}`;
	}
	return { viewBox, inner };
}

/**
 * Build the manifest object from disk. Categories come from the first
 * folder segment under static/map/; top-level SVGs get "misc". Slugs are
 * the filename without extension; combined manifest key is
 * "<category>/<slug>" so two categories can share a slug ("bear" as a foe
 * and a place, say).
 * @returns {Record<string, MapIconRow>}
 */
function buildManifest() {
	const files = walkSvgs(ICON_ROOT);
	/** @type {Record<string, MapIconRow>} */
	const manifest = {};
	for (const abs of files) {
		const rel = relative(ICON_ROOT, abs).replace(/\\/g, '/');
		const segs = rel.split('/');
		const filename = segs.pop() || '';
		const slug = filename.replace(/\.svg$/i, '');
		const category = segs.length > 0 ? segs[0] : 'misc';
		const key = `${category}/${slug}`;
		try {
			const source = readFileSync(abs, 'utf-8');
			const { viewBox, inner } = parseSvg(source);
			manifest[key] = {
				slug,
				label: titleCase(slug),
				category,
				categoryLabel: titleCase(category),
				viewBox,
				inner,
			};
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.warn(`[map-icons] skipping ${rel}: ${msg}`);
		}
	}
	return manifest;
}

/** Render the manifest as a stable, formatted TypeScript module.
 * @param {Record<string, MapIconRow>} manifest
 * @returns {string}
 */
function renderTs(manifest) {
	const keys = Object.keys(manifest).sort();
	const rows = keys
		.map((k) => {
			const m = manifest[k];
			return `\t${JSON.stringify(k)}: { slug: ${JSON.stringify(m.slug)}, label: ${JSON.stringify(m.label)}, category: ${JSON.stringify(m.category)}, categoryLabel: ${JSON.stringify(m.categoryLabel)}, viewBox: ${JSON.stringify(m.viewBox)}, inner: ${JSON.stringify(m.inner)} },`;
		})
		.join('\n');
	return `// =============================================================================
// AUTO-GENERATED. Do not edit by hand.
// Regenerated from apps/web/static/map/**/*.svg by
// apps/web/scripts/build-map-icons.mjs on every vite dev/build.
// =============================================================================

export interface MapIcon {
\t/** Filename without extension, e.g. "hanging-spider". */
\tslug: string;
\t/** Title-cased human label, e.g. "Hanging Spider". */
\tlabel: string;
\t/** First folder under static/map/, e.g. "creatures". Top-level SVGs are
\t *  bucketed under "misc". */
\tcategory: string;
\t/** Title-cased category label, e.g. "Creatures". */
\tcategoryLabel: string;
\t/** viewBox attribute lifted from the source SVG, e.g. "0 0 512 512". */
\tviewBox: string;
\t/** Inner SVG markup with fills stripped. Wrap in <g fill={color}> to
\t *  colorise. */
\tinner: string;
}

/** Full manifest, keyed by "<category>/<slug>". */
export const MAP_ICONS: Record<string, MapIcon> = {
${rows}
};

/** Ordered list for iteration (category-first, then alphabetical by slug). */
export const MAP_ICON_LIST: MapIcon[] = Object.values(MAP_ICONS);

/** Category ordering for the picker (sorted alphabetically). */
export const MAP_ICON_CATEGORIES: string[] = Array.from(
\tnew Set(MAP_ICON_LIST.map((i) => i.category)),
).sort();
`;
}

/** Regenerate the manifest file. Returns metadata for the caller.
 * @returns {{count: number, changed: boolean}}
 */
export function generate() {
	const manifest = buildManifest();
	const ts = renderTs(manifest);
	mkdirSync(dirname(OUT_PATH), { recursive: true });
	// Skip the write if the content is byte-for-byte identical so we don't
	// tickle Vite's HMR watcher every rebuild.
	if (existsSync(OUT_PATH)) {
		const existing = readFileSync(OUT_PATH, 'utf-8');
		if (existing === ts) return { count: Object.keys(manifest).length, changed: false };
	}
	writeFileSync(OUT_PATH, ts, 'utf-8');
	return { count: Object.keys(manifest).length, changed: true };
}

// Allow running directly: `node scripts/build-map-icons.mjs`.
if (import.meta.url === `file://${process.argv[1]}`) {
	const { count, changed } = generate();
	console.log(
		`[map-icons] ${changed ? 'wrote' : 'up-to-date'}: ${count} icon${count === 1 ? '' : 's'}`,
	);
}
