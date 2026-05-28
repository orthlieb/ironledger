/**
 * Crop an uploaded image file to a centred square JPEG data URL, sized
 * down to at most `maxSize × maxSize` (default 512×512) at 0.85 quality.
 * 512 keeps the portrait crisp when opened in the lightbox (up to
 * 80vw/80vh) while staying manageable in the character JSON payload.
 *
 * Shared by the character, expedition, community, and NPC portrait
 * uploaders. Returns a Promise that resolves with the data URL.
 */
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
				canvas.width  = size;
				canvas.height = size;
				const ctx = canvas.getContext('2d');
				if (!ctx) { reject(new Error('2d context unavailable')); return; }
				const sx = (img.width  - side) / 2;
				const sy = (img.height - side) / 2;
				ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
				resolve(canvas.toDataURL('image/jpeg', quality));
			};
			img.src = reader.result as string;
		};
		reader.readAsDataURL(file);
	});
}
