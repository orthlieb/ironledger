// =============================================================================
// Iron Ledger — Campaign map exports + imports
//
// Two flavours of round-trippable export, both triggered from MapDialog's
// toolbar (or the hamburger-menu Export dialog):
//
//   • PNG snapshot — rasterises the currently-rendered SVG (background +
//     grid + markers + labels) to a PNG and triggers a browser download.
//     The image is baked in — the resulting file is fully self-contained
//     and can be shared, printed, or dropped into session notes.
//     One-way (no re-import).
//
//   • Zip bundle — a `.zip` containing the map's metadata + marker list
//     as JSON alongside the raw background image bytes. Round-trippable
//     via `importMapZip()`. Chosen over inlined JSON to avoid the ~33 %
//     base64 inflation on the (typically ~500 kB) background image and
//     to match the "Everything" export pattern already used elsewhere
//     in the app.
//
// SVG-to-PNG works via the standard <img src="data:image/svg+xml,..."> →
// canvas.drawImage pipeline. The tricky part is that the background
// image is a *remote* href (/api/session/maps/:id/background) — the SVG
// image element loads it asynchronously and the canvas won't draw a
// broken image, so we resolve the background to a data URL before
// serialisation.
// =============================================================================

import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import {
	createMap,
	mapState,
	persistSettings,
	replaceMarkers,
	setBackground,
	switchMap,
	type MapMarker,
	type MapServerSettings,
} from './mapStore.svelte.js';

/** Suggested filename stamp: 'YYYY-MM-DD_HHmm'. */
function stamp(): string {
	const d = new Date();
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

function download(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

/** Slugify a name for safe filenames — letters/digits/hyphens only.
 *  Falls back to `map` when the input is empty after cleaning. */
function slugify(s: string): string {
	const cleaned = s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return cleaned || 'map';
}

// ---------------------------------------------------------------------------
// Zip export
// ---------------------------------------------------------------------------

/** Envelope written to `manifest.json` inside every export zip. Import
 *  reads `type` to reject non-map bundles. */
export interface MapZipManifest {
	app: 'Iron Ledger';
	version: '1.0.0';
	exportedAt: string;
	type: 'map';
}

/** Body of `map.json` — the map's user-facing metadata + payload. The
 *  background image lives in a sibling `background.jpg` file, not
 *  inlined here, so the JSON stays small and diffable. */
export interface MapZipBody {
	name: string;
	markers: MapMarker[];
	settings: MapServerSettings;
}

/** Fetch the background URL as raw bytes. Returns `null` when there's
 *  no background or the fetch fails — the caller just omits the file
 *  from the zip in that case. Used by both per-map export and the
 *  "Everything" bundle. */
async function fetchBackgroundBytes(url: string): Promise<Uint8Array | null> {
	if (!url) return null;
	try {
		const res = await fetch(url);
		if (!res.ok) return null;
		return new Uint8Array(await res.arrayBuffer());
	} catch {
		return null;
	}
}

/**
 * Build the file entries for a single map's zip export — used both by
 * per-map export (wrapped as a standalone .zip) and by the "Everything"
 * bundle (nested under `maps/<mapId>/…`). Returns a `Record<path, bytes>`
 * that fflate consumes directly.
 */
export async function buildMapZipEntries(input: {
	name: string;
	markers: MapMarker[];
	settings: MapServerSettings;
	backgroundUrl: string;
}): Promise<Record<string, Uint8Array>> {
	const manifest: MapZipManifest = {
		app: 'Iron Ledger',
		version: '1.0.0',
		exportedAt: new Date().toISOString(),
		type: 'map',
	};
	const body: MapZipBody = {
		name: input.name,
		markers: input.markers,
		settings: input.settings,
	};
	const files: Record<string, Uint8Array> = {
		'manifest.json': strToU8(JSON.stringify(manifest, null, 2)),
		'map.json': strToU8(JSON.stringify(body, null, 2)),
	};
	const bg = await fetchBackgroundBytes(input.backgroundUrl);
	if (bg) files['background.jpg'] = bg;
	return files;
}

/**
 * Export a single map as a downloadable .zip. Filename includes the
 * slugified map name so a user with many maps can tell them apart in
 * their Downloads folder.
 */
export async function exportMapZip(input: {
	name: string;
	markers: MapMarker[];
	settings: MapServerSettings;
	backgroundUrl: string;
}): Promise<void> {
	const files = await buildMapZipEntries(input);
	const zipped = zipSync(files, { level: 6 });
	const blob = new Blob([zipped], { type: 'application/zip' });
	download(blob, `map-${slugify(input.name)}-${stamp()}.zip`);
}

// ---------------------------------------------------------------------------
// Zip import
// ---------------------------------------------------------------------------

export class MapImportError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'MapImportError';
	}
}

/** Convert raw bytes into a `data:image/jpeg;base64,…` URL — the shape
 *  `setBackground()` (and the PUT endpoint behind it) expects. */
function bytesToJpegDataUrl(bytes: Uint8Array): string {
	let binary = '';
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return `data:image/jpeg;base64,${btoa(binary)}`;
}

/**
 * Import a `.zip` produced by `exportMapZip()`. Creates a fresh map on
 * the server (does not overwrite an existing map), populates markers +
 * settings, and uploads the background image if one was in the zip.
 *
 * The new map's id is returned so callers can jump to it. Throws
 * `MapImportError` with a user-readable message on any validation
 * failure — bad envelope, wrong type, malformed markers, etc.
 */
export async function importMapZip(file: File): Promise<string> {
	if (!file) throw new MapImportError('No file selected.');
	let buf: ArrayBuffer;
	try {
		buf = await file.arrayBuffer();
	} catch {
		throw new MapImportError('Could not read the file.');
	}
	let entries: Record<string, Uint8Array>;
	try {
		entries = unzipSync(new Uint8Array(buf));
	} catch {
		throw new MapImportError('Not a valid .zip archive.');
	}

	// Manifest + type gate — reject cross-app zips or empty bundles.
	const manifestBytes = entries['manifest.json'];
	if (!manifestBytes)
		throw new MapImportError('Missing manifest.json — is this an Iron Ledger map export?');
	let manifest: MapZipManifest;
	try {
		manifest = JSON.parse(strFromU8(manifestBytes)) as MapZipManifest;
	} catch {
		throw new MapImportError('manifest.json is not valid JSON.');
	}
	if (manifest.type !== 'map') {
		throw new MapImportError(`This is a ${manifest.type ?? 'unknown'} export, not a map.`);
	}

	// Body — name / markers / settings.
	const bodyBytes = entries['map.json'];
	if (!bodyBytes) throw new MapImportError('Missing map.json inside the zip.');
	let body: MapZipBody;
	try {
		body = JSON.parse(strFromU8(bodyBytes)) as MapZipBody;
	} catch {
		throw new MapImportError('map.json is not valid JSON.');
	}
	const name = typeof body.name === 'string' && body.name.trim() ? body.name : 'Imported Map';
	const markers = Array.isArray(body.markers) ? body.markers : [];
	const settings = body.settings && typeof body.settings === 'object' ? body.settings : {};

	// Provision a fresh map on the server + activate it. createMap()
	// already hydrates mapState.activeId + name to the new map, so
	// subsequent replaceMarkers / setBackground / persistSettings hit
	// the right row.
	const summary = await createMap({ name });
	if (mapState.activeId !== summary.id) await switchMap(summary.id);

	// Push markers in a single PUT (replaceMarkers regenerates ids so a
	// re-import against the same account doesn't collide).
	const cleanMarkers = markers
		.filter((m) => m && typeof m.x === 'number' && typeof m.y === 'number')
		.map((m) => ({
			x: m.x,
			y: m.y,
			label: typeof m.label === 'string' ? m.label : '',
			icon: typeof m.icon === 'string' ? m.icon : '',
			color: typeof m.color === 'string' ? m.color : undefined,
			entityId: typeof m.entityId === 'string' ? m.entityId : undefined,
			angle: typeof m.angle === 'number' && Number.isFinite(m.angle) ? m.angle : undefined,
		}));
	await replaceMarkers(cleanMarkers);

	// Merge settings (aspect / scale / view) so the imported map opens
	// the same way it was exported. Persist immediately so a page
	// reload sees the imported settings, not the fresh-map defaults.
	mapState.settings = { ...mapState.settings, ...settings };
	await persistSettings();

	// Background bytes are optional — a map with no background uploaded
	// simply won't have a `background.jpg` entry. setBackground also
	// re-patches settings.aspect if we pass one, which is fine.
	const bg = entries['background.jpg'];
	if (bg && bg.length > 0) {
		const aspect =
			typeof settings.aspect === 'number' && Number.isFinite(settings.aspect) && settings.aspect > 0
				? settings.aspect
				: undefined;
		await setBackground(bytesToJpegDataUrl(bg), aspect);
	}

	return summary.id;
}

// ---------------------------------------------------------------------------
// PNG export (unchanged)
// ---------------------------------------------------------------------------

/**
 * Fetch the map background URL and return a data URL so it can be inlined
 * in the SVG we're about to serialise. Without this step the exported
 * PNG has a blank/broken background — the canvas draws a snapshot of the
 * SVG DOM, and cross-origin/late-loading href resolutions don't survive
 * the drawImage boundary reliably.
 */
async function urlToDataUrl(url: string): Promise<string> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Failed to fetch background image (${res.status})`);
	const blob = await res.blob();
	return await new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
		reader.readAsDataURL(blob);
	});
}

/**
 * Rasterise the live map SVG to a PNG download. `showLabels` is passed
 * through so the export honours the current label-visibility toggle —
 * users usually want the same view they're looking at, not with labels
 * suddenly on/off.
 *
 * Sizing: match the background image's natural pixel dimensions so
 * the exported PNG is the same size + aspect ratio the user originally
 * uploaded (post-downscale — everything above `MAP_IMAGE_MAX_DIMENSION`
 * gets shrunk on upload). Without a background image we fall back to a
 * `FALLBACK_LONG_EDGE_PX`-long-edge PNG sized from the viewBox aspect,
 * since the viewBox itself is world units (~20 × 11) and a naïve
 * `viewBox × 2` scale would produce a postage-stamp file.
 */
const FALLBACK_LONG_EDGE_PX = 2000;

/** Load the given data URL into an Image and return its natural size,
 *  or null if it doesn't decode. Used to size the PNG to the source
 *  background's dimensions. */
async function measureImage(dataUrl: string): Promise<{ w: number; h: number } | null> {
	try {
		return await new Promise<{ w: number; h: number } | null>((resolve) => {
			const img = new Image();
			img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
			img.onerror = () => resolve(null);
			img.src = dataUrl;
		});
	} catch {
		return null;
	}
}

export async function exportMapPng(svgEl: SVGSVGElement, showLabels: boolean): Promise<void> {
	// Clone so we don't mutate the live DOM.
	const clone = svgEl.cloneNode(true) as SVGSVGElement;

	// If there's a background <image href="…">, resolve it to a data URL
	// so the serialised SVG carries the pixels inline. Remember the
	// resolved bytes so we can measure them for output sizing.
	let bgDataUrl = '';
	const bgImage = clone.querySelector('image');
	if (bgImage) {
		const href = bgImage.getAttribute('href') ?? bgImage.getAttribute('xlink:href');
		if (href) {
			try {
				bgDataUrl = await urlToDataUrl(href);
				bgImage.setAttribute('href', bgDataUrl);
			} catch {
				// Continue with a blank background if the fetch fails; the
				// user still gets a usable grid + markers PNG rather than
				// a hard failure.
			}
		}
	}

	// Optionally strip label <text> elements so the PNG matches the
	// current UI toggle state. Icons always render.
	if (!showLabels) {
		clone.querySelectorAll('text').forEach((el) => el.remove());
	}

	// Sizing: prefer the background image's actual pixel dimensions so
	// the PNG is the same size + aspect the user uploaded. Fallback:
	// scale from the viewBox aspect to a fixed long-edge target so
	// backgroundless exports still look reasonable.
	const viewBox = clone.getAttribute('viewBox');
	let widthPx = FALLBACK_LONG_EDGE_PX;
	let heightPx = Math.round(FALLBACK_LONG_EDGE_PX * 0.5625); // fallback 16:9
	const bgSize = bgDataUrl ? await measureImage(bgDataUrl) : null;
	if (bgSize && bgSize.w > 0 && bgSize.h > 0) {
		widthPx = bgSize.w;
		heightPx = bgSize.h;
	} else if (viewBox) {
		const [, , w, h] = viewBox.split(/\s+/).map(Number);
		if (w && h) {
			if (w >= h) {
				widthPx = FALLBACK_LONG_EDGE_PX;
				heightPx = Math.round((h / w) * FALLBACK_LONG_EDGE_PX);
			} else {
				heightPx = FALLBACK_LONG_EDGE_PX;
				widthPx = Math.round((w / h) * FALLBACK_LONG_EDGE_PX);
			}
		}
	}
	clone.setAttribute('width', String(widthPx));
	clone.setAttribute('height', String(heightPx));
	// Add the SVG namespace explicitly — required for standalone .svg parsing.
	clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
	clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

	const svgSource = new XMLSerializer().serializeToString(clone);
	const svgBlob = new Blob([svgSource], { type: 'image/svg+xml;charset=utf-8' });
	const svgUrl = URL.createObjectURL(svgBlob);

	try {
		const img = await new Promise<HTMLImageElement>((resolve, reject) => {
			const el = new Image();
			el.onload = () => resolve(el);
			el.onerror = () => reject(new Error('Could not rasterise map SVG'));
			el.src = svgUrl;
		});

		const canvas = document.createElement('canvas');
		canvas.width = widthPx;
		canvas.height = heightPx;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Browser did not provide a 2D canvas context');
		ctx.drawImage(img, 0, 0, widthPx, heightPx);

		await new Promise<void>((resolve, reject) => {
			canvas.toBlob((blob) => {
				if (!blob) return reject(new Error('canvas.toBlob returned null'));
				download(blob, `campaign-map-${stamp()}.png`);
				resolve();
			}, 'image/png');
		});
	} finally {
		URL.revokeObjectURL(svgUrl);
	}
}
