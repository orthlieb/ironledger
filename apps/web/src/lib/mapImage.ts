// =============================================================================
// Iron Ledger — Background image ingest for the campaign map
//
// Reads a user-supplied File (from an <input type="file"> or drop event),
// downscales the pixels to a max longest side of MAP_IMAGE_MAX_DIMENSION,
// re-encodes as JPEG at MAP_IMAGE_QUALITY, and returns a base64 data URL
// suitable for setBackground(). Pure-browser — canvas + FileReader.
//
// Rejects (via thrown MapImageError) on:
//   • upload > MAP_IMAGE_MAX_UPLOAD_BYTES (pre-decode safety)
//   • non-image MIME
//   • decoded blob > MAP_IMAGE_MAX_STORED_BYTES (still too big after scale)
//
// Keeping this file out of the store module means the store stays
// pure-state and the image ingest is testable in isolation (Playwright
// only — jsdom doesn't have <canvas>).
// =============================================================================

import {
	MAP_IMAGE_MAX_DIMENSION,
	MAP_IMAGE_QUALITY,
	MAP_IMAGE_MAX_UPLOAD_BYTES,
	MAP_IMAGE_MAX_STORED_BYTES,
} from './mapConstants.js';

export class MapImageError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'MapImageError';
	}
}

/**
 * Read a File into an Image element. Rejects on load error or if the file
 * exceeds the pre-decode cap. Used internally by downscaleImage.
 */
function loadFileToImage(file: File): Promise<HTMLImageElement> {
	if (file.size > MAP_IMAGE_MAX_UPLOAD_BYTES) {
		return Promise.reject(
			new MapImageError(
				`Image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 20 MB.`,
			),
		);
	}
	if (!file.type.startsWith('image/')) {
		return Promise.reject(
			new MapImageError(`"${file.name}" isn't an image (got ${file.type || 'no MIME type'}).`),
		);
	}
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			resolve(img);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new MapImageError('Browser could not decode this image.'));
		};
		img.src = url;
	});
}

/**
 * Downscale an image so its longest side is at most MAP_IMAGE_MAX_DIMENSION,
 * then re-encode as JPEG at MAP_IMAGE_QUALITY. Returns a `data:image/jpeg`
 * URL. If the image is already smaller than the cap, it's still re-encoded
 * so we always end up with predictable JPEG bytes.
 */
export async function downscaleImage(file: File): Promise<string> {
	const img = await loadFileToImage(file);
	const longest = Math.max(img.width, img.height);
	const scale = Math.min(1, MAP_IMAGE_MAX_DIMENSION / longest);
	const w = Math.round(img.width * scale);
	const h = Math.round(img.height * scale);
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new MapImageError('Browser did not provide a 2D canvas context.');
	ctx.drawImage(img, 0, 0, w, h);
	const dataUrl = canvas.toDataURL('image/jpeg', MAP_IMAGE_QUALITY);
	// Rough post-encode size: data URL length × 3/4 ≈ raw bytes. Reject
	// pathological cases where a scaled image still won't fit our
	// localStorage budget (rare — usually only if the source is
	// already-lossy JPEG at obscene dimensions).
	const bytes = Math.floor((dataUrl.length * 3) / 4);
	if (bytes > MAP_IMAGE_MAX_STORED_BYTES) {
		throw new MapImageError(
			`Image is still too large after scaling (${(bytes / 1024 / 1024).toFixed(1)} MB). Please crop or use a lower-resolution source.`,
		);
	}
	return dataUrl;
}
