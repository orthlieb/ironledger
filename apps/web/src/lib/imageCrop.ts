/**
 * Crop an uploaded image file to a centred square data URL, sized down to at
 * most `maxSize × maxSize` (default 512×512). 512 keeps the portrait crisp
 * when opened in the lightbox (up to 80vw/80vh) while staying manageable in
 * the character JSON payload.
 *
 * Encoding is chosen to preserve transparency: if the cropped image has any
 * transparent pixels it is exported as PNG (lossless, keeps the alpha channel
 * so it renders against the page rather than being flattened onto black);
 * otherwise it is exported as JPEG at `quality` (much smaller for photos).
 *
 * Shared by the character, expedition, community, and NPC portrait
 * uploaders. Returns a Promise that resolves with the data URL.
 */
function hasTransparentPixels(ctx: CanvasRenderingContext2D, size: number): boolean {
	const { data } = ctx.getImageData(0, 0, size, size);
	for (let i = 3; i < data.length; i += 4) {
		if (data[i] < 255) return true;
	}
	return false;
}

export function cropImageFile(file: File, maxSize = 512, quality = 0.85): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
		reader.onload = () => {
			const img = new Image();
			img.onerror = () => reject(new Error('Image decode failed'));
			img.onload = () => {
				const side = Math.min(img.width, img.height);
				const size = Math.min(side, maxSize);
				const canvas = document.createElement('canvas');
				canvas.width = size;
				canvas.height = size;
				const ctx = canvas.getContext('2d');
				if (!ctx) {
					reject(new Error('2d context unavailable'));
					return;
				}
				const sx = (img.width - side) / 2;
				const sy = (img.height - side) / 2;
				ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
				// Keep transparency (PNG) when present; otherwise JPEG for size.
				resolve(
					hasTransparentPixels(ctx, size)
						? canvas.toDataURL('image/png')
						: canvas.toDataURL('image/jpeg', quality),
				);
			};
			img.src = reader.result as string;
		};
		reader.readAsDataURL(file);
	});
}
