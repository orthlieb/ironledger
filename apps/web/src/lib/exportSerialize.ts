// =============================================================================
// Iron Ledger — Export serialisation helpers (pure)
//
// The stateless building blocks of the Hamburger → Export flow, extracted out
// of routes/home/+page.svelte so the route file holds orchestration (which
// stores to read, which dialog to open) rather than serialisation mechanics.
// Every function here takes its inputs as arguments and reads no component
// state — safe to unit-test and reuse.
//   • filename / stamp helpers: makeTimestamp, slugify, bodyFilenameForType
//   • download primitives:      downloadFile, exportJson, exportZip
//   • portrait <-> bytes:       extractPortraits, b64ToU8
//   • markdown:                 htmlToMd, formatTicks
// =============================================================================

import { zipSync, strToU8 } from 'fflate';

/** Local-time filename stamp: `YYYY-MM-DD_HHmm`. */
export function makeTimestamp(): string {
	const now = new Date();
	return (
		`${now.getFullYear()}-` +
		String(now.getMonth() + 1).padStart(2, '0') +
		'-' +
		String(now.getDate()).padStart(2, '0') +
		'_' +
		String(now.getHours()).padStart(2, '0') +
		String(now.getMinutes()).padStart(2, '0')
	);
}

/** Slugify a name for filenames — lowercase letters/digits/hyphens, ≤40 chars. */
export function slugify(name: string): string {
	return (name || 'unnamed')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 40);
}

/** Canonical body filename for a given export type — matches the candidates
 *  the sanitizer's `parseImportZip` scans. */
export function bodyFilenameForType(type: string): string {
	if (type === 'all-characters') return 'characters.json';
	return `${type}.json`;
}

/** Trigger a browser download of in-memory text/binary content. */
export function downloadFile(filename: string, content: string, mime: string): void {
	const blob = new Blob([content], { type: mime });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

/** Wrap a payload in the manifest envelope and download it as pretty JSON. */
export function exportJson(type: string, payload: unknown, count: number, filename: string): void {
	const wrapper = {
		manifest: {
			app: 'Iron Ledger',
			version: '1.0.0',
			exportedAt: new Date().toISOString(),
			type,
			count,
		},
		data: payload,
	};
	downloadFile(filename, JSON.stringify(wrapper, null, 2), 'application/json');
}

/** Decode a `data:...;base64,...` URL to raw bytes. */
export function b64ToU8(dataUrl: string): Uint8Array {
	const b64 = dataUrl.split(',')[1] ?? '';
	const binary = atob(b64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

/** Extract every inline data URL under `imageUrl` / `portrait` field names,
 *  save the bytes into the accumulating `images` map, and return a copy of
 *  `value` with those fields replaced by `imageUrlFile` / `portraitFile`
 *  references. The reassembler on import (importSanitizer.reassemblePortraits)
 *  reverses the mapping. */
export function extractPortraits(
	value: unknown,
	images: Record<string, Uint8Array>,
	counter: { n: number },
): unknown {
	if (value === null || typeof value !== 'object') return value;
	if (Array.isArray(value)) {
		return value.map((v) => extractPortraits(v, images, counter));
	}
	const obj = value as Record<string, unknown>;
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(obj)) {
		const refKey = k === 'imageUrl' ? 'imageUrlFile' : k === 'portrait' ? 'portraitFile' : null;
		if (refKey && typeof v === 'string' && v.startsWith('data:')) {
			const match = /^data:([^;,]+);base64,/.exec(v);
			if (match) {
				const mime = match[1];
				const bytes = b64ToU8(v);
				const ext =
					mime === 'image/png'
						? 'png'
						: mime === 'image/webp'
							? 'webp'
							: mime === 'image/gif'
								? 'gif'
								: 'jpg';
				counter.n++;
				const path = `images/portrait-${counter.n}.${ext}`;
				images[path] = bytes;
				out[refKey] = path;
				continue;
			}
		}
		out[k] = extractPortraits(v, images, counter);
	}
	return out;
}

/**
 * Build + download a `.zip` export bundle:
 *   manifest.json  { app, version, exportedAt, type, count, body }
 *   <type>.json    the payload, with inline portrait data URLs swapped for
 *                  imageUrlFile / portraitFile references
 *   images/…       the extracted portrait bytes
 *   …extraFiles    bundled binary assets outside the JSON body (e.g. the
 *                  Everything export's nested maps/<id>/… dirs)
 */
export async function exportZip(
	type: string,
	payload: unknown,
	count: number,
	filename: string,
	extraFiles: Record<string, Uint8Array> = {},
): Promise<void> {
	const images: Record<string, Uint8Array> = {};
	const counter = { n: 0 };
	const body = extractPortraits(payload, images, counter);
	const bodyName = bodyFilenameForType(type);
	const manifest = {
		app: 'Iron Ledger',
		version: '1.0.0',
		exportedAt: new Date().toISOString(),
		type,
		count,
		body: bodyName,
	};
	const files: Record<string, Uint8Array> = {
		'manifest.json': strToU8(JSON.stringify(manifest, null, 2)),
		[bodyName]: strToU8(JSON.stringify(body, null, 2)),
		...images,
		// Merged last so a caller can't clobber the manifest/body.
		...extraFiles,
	};
	const zipped = zipSync(files, { level: 6 });
	const blob = new Blob([zipped], { type: 'application/zip' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

/** Very small HTML → Markdown converter for the log/story exports. Requires a
 *  DOM (returns the input unchanged during SSR). */
export function htmlToMd(html: string): string {
	if (typeof document === 'undefined') return html;
	const tmp = document.createElement('div');
	tmp.innerHTML = html;
	const lines: string[] = [''];
	function walk(node: Node) {
		if (node.nodeType === Node.TEXT_NODE) {
			const t = (node.textContent ?? '').replace(/\n/g, ' ');
			if (t.trim()) lines[lines.length - 1] = (lines[lines.length - 1] ?? '') + t;
		} else if (node.nodeType === Node.ELEMENT_NODE) {
			const el = node as HTMLElement;
			const tag = el.tagName.toLowerCase();
			if (tag === 'ul' || tag === 'ol') {
				el.querySelectorAll('li').forEach((li) => lines.push(`- ${li.textContent?.trim() ?? ''}`));
			} else if (tag === 'li') {
				/* handled by parent */
			} else if (tag === 'br') {
				lines.push('');
			} else {
				const block = ['div', 'p', 'h1', 'h2', 'h3', 'h4'].includes(tag);
				if (block && lines.length > 0) lines.push('');
				let inline = '';
				el.childNodes.forEach((child) => {
					if (child.nodeType === Node.TEXT_NODE) inline += child.textContent ?? '';
					else if (child.nodeType === Node.ELEMENT_NODE) {
						const ct = (child as HTMLElement).tagName.toLowerCase();
						const inner = (child as HTMLElement).textContent ?? '';
						if (ct === 'strong' || ct === 'b') inline += `**${inner}**`;
						else if (ct === 'em' || ct === 'i') inline += `_${inner}_`;
						else if (ct === 's') inline += `~~${inner}~~`;
						else inline += inner;
					}
				});
				const text = inline.trim();
				if (text) lines.push(text);
			}
		}
	}
	tmp.childNodes.forEach((n) => walk(n));
	return lines
		.filter((l, i, a) => !(l === '' && a[i - 1] === ''))
		.join('\n')
		.trim();
}

/** Render a progress-track tick count as "N/10 boxes[, r/4 ticks]". */
export function formatTicks(ticks: number, totalBoxes = 10): string {
	const boxes = Math.floor(ticks / 4);
	const rem = ticks % 4;
	return rem > 0 ? `${boxes}/${totalBoxes} boxes, ${rem}/4 ticks` : `${boxes}/${totalBoxes} boxes`;
}
