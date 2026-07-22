// =============================================================================
// Iron Ledger — Campaign map exports
//
// Two flavours, both triggered from MapDialog's toolbar:
//
//   • PNG snapshot — rasterises the currently-rendered SVG (background +
//     grid + markers + labels) to a PNG and triggers a browser download.
//     The image is baked in — the resulting file is fully self-contained
//     and can be shared, printed, or dropped into session notes.
//
//   • JSON round-trip — writes a small JSON envelope with the marker list
//     and a note pointing at the background image endpoint. Useful for
//     back-up or cross-account transfer; full round-trip import is a
//     Tier 2 concern (needs upload + hash-remap on the receiving side).
//
// SVG-to-PNG works via the standard <img src="data:image/svg+xml,..."> →
// canvas.drawImage pipeline. The tricky part is that the background
// image is a *remote* href (/api/session/map/background) — the SVG image
// element loads it asynchronously and the canvas won't draw a broken
// image, so we resolve the background to a data URL before serialisation.
// =============================================================================

import type { MapMarker } from './mapStore.svelte.js';

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

// ---------------------------------------------------------------------------
// JSON export
// ---------------------------------------------------------------------------

/**
 * Envelope for the JSON export. Mirrors the "Everything" export shape at
 * the top level so we can move this into that bundle later without
 * reshaping the payload.
 */
export interface MapJsonEnvelope {
	manifest: {
		app: 'Iron Ledger';
		version: '1.0.0';
		exportedAt: string;
		type: 'map';
	};
	data: {
		markers: MapMarker[];
		/** Server-side hash of the background image (empty when unset). */
		backgroundHash: string;
		/** Fully-qualified URL of the background — informational for humans
		 *  reading the export. Full round-trip import needs to re-upload
		 *  the image bytes; that's a Tier 2 concern. */
		backgroundUrl: string;
	};
}

export function exportMapJson(input: {
	markers: MapMarker[];
	backgroundHash: string;
	backgroundUrl: string;
}): void {
	const env: MapJsonEnvelope = {
		manifest: {
			app: 'Iron Ledger',
			version: '1.0.0',
			exportedAt: new Date().toISOString(),
			type: 'map',
		},
		data: {
			markers: input.markers,
			backgroundHash: input.backgroundHash,
			backgroundUrl: input.backgroundUrl,
		},
	};
	const blob = new Blob([JSON.stringify(env, null, 2)], { type: 'application/json' });
	download(blob, `campaign-map-${stamp()}.json`);
}

// ---------------------------------------------------------------------------
// PNG export
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
 * suddenly on/off. Baked scale of 2× the viewBox gives ~1600px PNGs
 * that print cleanly at letter size.
 */
export async function exportMapPng(svgEl: SVGSVGElement, showLabels: boolean): Promise<void> {
	// Clone so we don't mutate the live DOM.
	const clone = svgEl.cloneNode(true) as SVGSVGElement;

	// If there's a background <image href="…">, resolve it to a data URL
	// so the serialised SVG carries the pixels inline.
	const bgImage = clone.querySelector('image');
	if (bgImage) {
		const href = bgImage.getAttribute('href') ?? bgImage.getAttribute('xlink:href');
		if (href) {
			try {
				const dataUrl = await urlToDataUrl(href);
				bgImage.setAttribute('href', dataUrl);
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

	// Serialise + wrap in a data URL, then load into an <img> so canvas
	// can drawImage it. Explicit width/height on the SVG source tells the
	// image loader what size to rasterise at.
	const viewBox = clone.getAttribute('viewBox');
	const scale = 2;
	let widthPx = 1600;
	let heightPx = 1000;
	if (viewBox) {
		const [, , w, h] = viewBox.split(/\s+/).map(Number);
		if (w && h) {
			widthPx = Math.round(w * scale);
			heightPx = Math.round(h * scale);
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
