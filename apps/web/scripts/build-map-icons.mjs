// =============================================================================
// Iron Ledger — Map icon manifest generator
//
// Scans apps/web/static/map/<category>/<slug>.{svg,png} and emits a
// TypeScript module the app can import to enumerate every available marker
// icon. Subfolders are categories; kebab-case filenames become Title Case
// labels (hanging-spider -> Hanging Spider). Icons at the top level (no
// category) go into an implicit "misc" bucket.
//
// SVGs: the inner content is inlined into the manifest and stripped of any
// hardcoded `fill=`/`style="fill:…"` so the marker's chosen color takes
// effect at render time via a wrapping `<g fill={color}>`. Icons that use
// `stroke` are left alone — those keep their own outlines.
//
// PNGs (e.g. the hand-drawn Caeora settlement icons): wrapped in an
// `<image href="/map/…">` element that references the served static file
// (not base64 — keeps the manifest tiny, browser lazy-loads per icon).
// Marked `raster: true`; the render path (mapGlyphInner in mapConstants)
// tints these via an alpha-keyed SVG <filter> instead of `<g fill>`, so
// the marker colour still applies to black line-art. A `<slug>.png`
// supersedes a same-slug `<slug>.svg` in the same category.
//
// Run automatically before `vite dev`/`vite build` (see the Vite plugin
// in vite.config.ts) and also on filesystem changes to static/map/ during
// dev. Safe to re-run: writes only when the output differs.
// =============================================================================

import {
	copyFileSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
	existsSync,
	mkdirSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
// svg-path-bounds ships no TypeScript declarations; the exported default
// is `(pathD: string) => [left, top, right, bottom]`.
// @ts-expect-error — untyped module, treated as any
import pathBounds from 'svg-path-bounds';

/**
 * @typedef {{slug: string, label: string, category: string, categoryLabel: string, viewBox: string, inner: string, raster?: boolean, layered?: boolean, src?: string, palette?: string, source?: string}} MapIconRow
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = dirname(HERE);
const ICON_ROOT = join(WEB_ROOT, 'static', 'map');
const OUT_PATH = join(WEB_ROOT, 'src', 'lib', 'generated', 'mapIconManifest.ts');
const EXT_ROOT = join(WEB_ROOT, '..', '..', 'extensions');
/** Extension map icons are copied here so the dev server / build serves
 *  them (git-ignored; regenerated with the manifest). */
const EXT_STATIC = '_ext';

/** Walk a directory recursively, yielding absolute .svg / .png paths.
 * Raster PNGs (e.g. the hand-drawn Caeora settlement icons) are wrapped in
 * an <image> element at build time so they flow through the same manifest
 * and render path as vector icons — see buildManifest().
 * @param {string} dir
 * @returns {string[]}
 */
function walkIcons(dir) {
	if (!existsSync(dir)) return [];
	/** @type {string[]} */
	const out = [];
	for (const entry of readdirSync(dir)) {
		const p = join(dir, entry);
		const s = statSync(p);
		// static/map/_ext/ holds generated copies of extension icons — those
		// are indexed from extensions/ (with their source) instead.
		if (s.isDirectory()) {
			if (dir === ICON_ROOT && entry === EXT_STATIC) continue;
			out.push(...walkIcons(p));
		} else if (s.isFile() && /\.(svg|png)$/i.test(entry)) out.push(p);
	}
	return out;
}

/** Read a PNG's pixel dimensions + a tight bounding box around the non-
 *  transparent pixels. Returns just `{w, h}` when the PNG isn't in a
 *  format we can decode (or has no alpha channel at all) — the caller
 *  then falls back to the raw pixel box.
 *
 *  Supports the format the Caeora hand-drawn icons ship in: RGBA
 *  (color type 6) at 8 bit depth. Other combinations return null-`bbox`
 *  (safe default). Non-interlaced only (Adam7 rejects) — again a safe
 *  fallback rather than a bad crop.
 * @param {string} abs
 * @returns {{w: number, h: number, bbox: {x: number, y: number, w: number, h: number} | null} | null}
 */
function pngProbe(abs) {
	const buf = readFileSync(abs);
	// 8-byte signature + "IHDR" at offset 12; width/height are the two
	// big-endian uint32s that follow at offsets 16 and 20.
	const isPng = buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47;
	if (!isPng || buf.toString('ascii', 12, 16) !== 'IHDR') return null;
	const w = buf.readUInt32BE(16);
	const h = buf.readUInt32BE(20);
	// IHDR body layout (after w + h): bitDepth (1) · colorType (1) ·
	// compression (1) · filter (1) · interlace (1). Compression + filter
	// are always 0 in a compliant PNG. Interlace 1 = Adam7 — we don't
	// deinterlace, so bail out.
	const bitDepth = buf.readUInt8(24);
	const colorType = buf.readUInt8(25);
	const interlace = buf.readUInt8(28);
	// Only fully-decode the shape most hand-drawn icons ship in.
	if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) return { w, h, bbox: null };

	// Walk the chunks past the 8-byte signature. Each chunk: length (uint32
	// BE) · type (4 chars) · data · CRC (uint32). Collect every IDAT into
	// one buffer for a single inflate call.
	/** @type {Buffer[]} */
	const idats = [];
	let off = 8;
	while (off + 8 <= buf.length) {
		const len = buf.readUInt32BE(off);
		const type = buf.toString('ascii', off + 4, off + 8);
		const dataStart = off + 8;
		const dataEnd = dataStart + len;
		if (dataEnd + 4 > buf.length) break;
		if (type === 'IDAT') idats.push(buf.subarray(dataStart, dataEnd));
		else if (type === 'IEND') break;
		off = dataEnd + 4;
	}
	if (idats.length === 0) return { w, h, bbox: null };
	/** @type {Buffer} */
	let raw;
	try {
		raw = inflateSync(Buffer.concat(idats));
	} catch {
		return { w, h, bbox: null };
	}
	// Every scanline: 1-byte filter type + w*4 bytes of RGBA. Undo the
	// filter in place, then scan for non-transparent pixels.
	const stride = w * 4;
	if (raw.length < (stride + 1) * h) return { w, h, bbox: null };
	/** @param {number} a @param {number} b @param {number} c */
	function paeth(a, b, c) {
		const p = a + b - c;
		const pa = Math.abs(p - a);
		const pb = Math.abs(p - b);
		const pc = Math.abs(p - c);
		if (pa <= pb && pa <= pc) return a;
		if (pb <= pc) return b;
		return c;
	}
	// Decoded scanline bytes, packed contiguously (no filter byte).
	const pixels = Buffer.alloc(stride * h);
	for (let y = 0; y < h; y++) {
		const filter = raw[y * (stride + 1)];
		const rowStart = y * (stride + 1) + 1;
		const outStart = y * stride;
		for (let i = 0; i < stride; i++) {
			const rawByte = raw[rowStart + i];
			const left = i >= 4 ? pixels[outStart + i - 4] : 0;
			const up = y > 0 ? pixels[outStart - stride + i] : 0;
			const upLeft = y > 0 && i >= 4 ? pixels[outStart - stride + i - 4] : 0;
			let val;
			switch (filter) {
				case 0:
					val = rawByte;
					break;
				case 1:
					val = (rawByte + left) & 0xff;
					break;
				case 2:
					val = (rawByte + up) & 0xff;
					break;
				case 3:
					val = (rawByte + ((left + up) >> 1)) & 0xff;
					break;
				case 4:
					val = (rawByte + paeth(left, up, upLeft)) & 0xff;
					break;
				default:
					return { w, h, bbox: null };
			}
			pixels[outStart + i] = val;
		}
	}
	// Walk the alpha channel (byte 3 of each 4-byte pixel) for the tight
	// bbox of any non-transparent pixel.
	let minX = w;
	let minY = h;
	let maxX = -1;
	let maxY = -1;
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			if (pixels[y * stride + x * 4 + 3] !== 0) {
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
		}
	}
	if (maxX < 0) return { w, h, bbox: null };
	return { w, h, bbox: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } };
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
 * Layered (multi-colour) SVG — the generated settlement kit. Detected by
 * `data-role="…"` paths. Not inlined (they run to tens of KB each): the
 * manifest keeps a tight viewBox, the root's `data-palette`, and the URL
 * the client lazily fetches (see mapIconCache.ts / mapLayered.ts).
 * @param {string} source
 * @returns {{viewBox: string, palette: string} | null} null if not layered
 */
function parseLayered(source) {
	if (!/<path\b[^>]*\bdata-role\s*=/.test(source)) return null;
	const vbMatch = source.match(/<svg\b[^>]*\sviewBox\s*=\s*"([^"]+)"/i);
	let viewBox = vbMatch ? vbMatch[1] : '0 0 24 24';
	const tight = computeTightBounds(source.replace(/^[\s\S]*?<svg\b[^>]*>/i, ''));
	if (tight && tight.w > 0 && tight.h > 0)
		viewBox = `${fmtNum(tight.x)} ${fmtNum(tight.y)} ${fmtNum(tight.w)} ${fmtNum(tight.h)}`;
	const palette = source.match(/<svg\b[^>]*\sdata-palette\s*=\s*"([^"]*)"/i)?.[1] ?? '';
	return { viewBox, palette };
}

/**
 * Wrap a raster PNG in an <image> element so it flows through the same
 * `{@html ic.inner}` render path as vector icons. The image is referenced
 * by its served URL (`/map/<category>/<slug>.png`), NOT inlined as base64,
 * so the generated manifest stays tiny and the browser lazy-loads each PNG
 * only when it's actually drawn. The render site's nested `<svg viewBox …
 * preserveAspectRatio="xMidYMid meet">` (the SVG default) fits the
 * viewBox region into the square marker slot undistorted.
 *
 * The <image> stays at the raw pixel box (0, 0, w, h) so the file's own
 * coordinates aren't stretched. When we can decode the alpha channel
 * (see pngProbe), the viewBox is instead the tight bbox around every
 * non-transparent pixel — the transparent margin many hand-drawn icons
 * ship with then falls outside the viewBox and the drawn shape fills
 * its slot edge-to-edge, matching the tightened-viewBox treatment
 * vector SVGs already get. Falls back to the raw pixel box when we
 * can't probe (unusual PNG variant, decode failure).
 *
 * Colouring happens at render time in mapGlyphInner() (mapConstants),
 * which tints raster icons through an alpha-keyed <filter> rather than
 * `<g fill>`, so the marker colour applies to the black line-art.
 * @param {string} rel  path relative to ICON_ROOT, e.g. "settlement/castle.png"
 * @param {number} w
 * @param {number} h
 * @param {{x: number, y: number, w: number, h: number} | null} bbox
 * @returns {{viewBox: string, inner: string}}
 */
function wrapPng(rel, w, h, bbox) {
	const href = `/map/${rel}`;
	const vb =
		bbox && bbox.w > 0 && bbox.h > 0
			? `${fmtNum(bbox.x)} ${fmtNum(bbox.y)} ${fmtNum(bbox.w)} ${fmtNum(bbox.h)}`
			: `0 0 ${w} ${h}`;
	return {
		viewBox: vb,
		inner: `<image href="${href}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" />`,
	};
}

/**
 * Build the manifest object from disk. Categories come from the first
 * folder segment under static/map/; top-level icons get "misc". Slugs are
 * the filename without extension; combined manifest key is
 * "<category>/<slug>" so two categories can share a slug ("bear" as a foe
 * and a place, say). PNGs and SVGs share the slug namespace: when both a
 * `<slug>.svg` and a `<slug>.png` exist in one category the PNG wins (a
 * dropped-in raster icon supersedes the old vector glyph of the same name).
 * @returns {Record<string, MapIconRow>}
 */
function buildManifest() {
	// Sort so .png sorts after .svg within a directory, letting the PNG
	// overwrite a same-key SVG entry on the second pass.
	const files = walkIcons(ICON_ROOT).sort();
	/** @type {Record<string, MapIconRow>} */
	const manifest = {};
	for (const abs of files) {
		const rel = relative(ICON_ROOT, abs).replace(/\\/g, '/');
		const segs = rel.split('/');
		const filename = segs.pop() || '';
		const isPng = /\.png$/i.test(filename);
		const slug = filename.replace(/\.(svg|png)$/i, '');
		const category = segs.length > 0 ? segs[0] : 'misc';
		const key = `${category}/${slug}`;
		try {
			let viewBox, inner;
			if (isPng) {
				const probe = pngProbe(abs);
				if (!probe) throw new Error('not a valid PNG');
				({ viewBox, inner } = wrapPng(rel, probe.w, probe.h, probe.bbox));
			} else {
				const text = readFileSync(abs, 'utf-8');
				const layered = parseLayered(text);
				if (layered) {
					manifest[key] = {
						slug,
						label: titleCase(slug),
						category,
						categoryLabel: titleCase(category),
						viewBox: layered.viewBox,
						inner: '',
						layered: true,
						src: `/map/${rel}`,
						palette: layered.palette,
					};
					continue;
				}
				({ viewBox, inner } = parseSvg(text));
			}
			manifest[key] = {
				slug,
				label: titleCase(slug),
				category,
				categoryLabel: titleCase(category),
				viewBox,
				inner,
				// Raster icons (PNG wrapped in <image>) render through a tint
				// filter instead of `<g fill>`; the render sites branch on this.
				...(isPng ? { raster: true } : {}),
			};
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.warn(`[map-icons] skipping ${rel}: ${msg}`);
		}
	}
	addExtensionIcons(manifest);
	return manifest;
}

/**
 * Index map icons contributed by extensions: `extensions/<id>/map/<folder>/
 * <slug>.svg` becomes category `<id>-<folder>`, labelled "<Folder> (<Name>)"
 * and tagged with `source: <id>` so the picker only offers it while that
 * extension is enabled (placed markers keep rendering regardless). Files
 * are copied under static/map/_ext/ so they're served for lazy loading.
 * @param {Record<string, MapIconRow>} manifest
 */
function addExtensionIcons(manifest) {
	const outRoot = join(ICON_ROOT, EXT_STATIC);
	/** Served copies written this run; anything else under _ext/ is stale. */
	const wanted = new Set();
	syncExtensionCopies(manifest, wanted);
	// Remove stale copies only — never wipe the folder, so a concurrent run
	// (dev-server watcher + build) can't empty it under the other.
	for (const abs of walkIcons(outRoot)) if (!wanted.has(abs)) rmSync(abs, { force: true });
}

/**
 * @param {Record<string, MapIconRow>} manifest
 * @param {Set<string>} wanted absolute paths of the served copies
 */
function syncExtensionCopies(manifest, wanted) {
	if (!existsSync(EXT_ROOT)) return;
	for (const id of readdirSync(EXT_ROOT).sort()) {
		const mapDir = join(EXT_ROOT, id, 'map');
		if (!existsSync(mapDir)) continue;
		let name = id;
		try {
			name = JSON.parse(readFileSync(join(EXT_ROOT, id, 'extension.json'), 'utf-8')).name ?? id;
		} catch {
			/* no readable extension.json — fall back to the id */
		}
		for (const abs of walkIcons(mapDir).sort()) {
			const rel = relative(mapDir, abs).replace(/\\/g, '/');
			const segs = rel.split('/');
			const filename = segs.pop() || '';
			if (!/\.svg$/i.test(filename) || segs.length === 0) continue;
			const slug = filename.replace(/\.svg$/i, '');
			const category = `${id}-${segs[0]}`;
			const served = `${EXT_STATIC}/${id}/${rel}`;
			const dest = join(ICON_ROOT, served);
			const text = readFileSync(abs, 'utf-8');
			wanted.add(dest);
			// Copy only when missing or changed, so the static/map watcher in
			// dev doesn't re-trigger itself.
			if (!existsSync(dest) || readFileSync(dest, 'utf-8') !== text) {
				mkdirSync(dirname(dest), { recursive: true });
				copyFileSync(abs, dest);
			}
			const layered = parseLayered(text);
			const base = {
				slug,
				label: titleCase(slug),
				category,
				categoryLabel: `${titleCase(segs[0])} (${name})`,
				source: id,
			};
			manifest[`${category}/${slug}`] = layered
				? {
						...base,
						viewBox: layered.viewBox,
						inner: '',
						layered: true,
						src: `/map/${served}`,
						palette: layered.palette,
					}
				: { ...base, ...parseSvg(text) };
		}
	}
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
			const rasterField = m.raster ? `, raster: true` : '';
			const layeredField = m.layered
				? `, layered: true, src: ${JSON.stringify(m.src)}, palette: ${JSON.stringify(m.palette ?? '')}`
				: '';
			const sourceField = m.source ? `, source: ${JSON.stringify(m.source)}` : '';
			return `\t${JSON.stringify(k)}: { slug: ${JSON.stringify(m.slug)}, label: ${JSON.stringify(m.label)}, category: ${JSON.stringify(m.category)}, categoryLabel: ${JSON.stringify(m.categoryLabel)}, viewBox: ${JSON.stringify(m.viewBox)}, inner: ${JSON.stringify(m.inner)}${rasterField}${layeredField}${sourceField} },`;
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
\t/** Inner SVG markup. For vector icons: paths with fills stripped, wrap
\t *  in <g fill={color}> to colorise. For raster icons: a single <image>
\t *  element referencing the served PNG (see the raster flag below). */
\tinner: string;
\t/** True for raster (PNG) icons wrapped in <image>. These render through
\t *  a tint <filter> keyed on the alpha channel instead of <g fill>, so the
\t *  marker colour still applies — see mapGlyphInner() in mapConstants. */
\traster?: boolean;
\t/** True for layered (multi-colour) icons from the settlement kit. Not
\t *  inlined: \`inner\` is empty and the file at \`src\` is fetched lazily,
\t *  then drawn in \`palette\` with the marker colour on the roofs — see
\t *  mapLayered.ts / mapIconCache.ts. */
\tlayered?: boolean;
\t/** URL of a layered icon's SVG file. */
\tsrc?: string;
\t/** A layered icon's palette, "wall:#…;roof:#…;…" (see parsePalette). */
\tpalette?: string;
\t/** Extension id for icons an extension contributes (extensions/<id>/map/).
\t *  The picker only offers them while that extension is enabled. */
\tsource?: string;
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
