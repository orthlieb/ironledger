// =============================================================================
// Iron Ledger — Import Sanitizer
//
// Validates and sanitizes untrusted data from an imported `.zip` bundle
// (produced by `exportZip()`) before any of it is sent to the API or
// rendered in the UI. The zip is decompressed, its `images/*` entries
// are reassembled into inline data URLs on the corresponding entity
// records, then a full sanitiser pass runs on the reconstituted JSON.
//
// Threat model:
//   • Prototype pollution  — __proto__ / constructor / prototype keys stripped
//   • XSS via log HTML     — script tags and event-handler attrs removed
//   • DoS via huge payloads — file-size, depth, and array-length limits
//   • Invalid JSON          — caught and re-thrown as ImportError (user-facing)
//   • Zip bomb              — total decompressed payload bounded by MAX_DECOMPRESSED
//
// SQL injection is NOT a concern here: the API layer uses Drizzle ORM with
// parameterized queries, and data is stored as JSONB blobs, never interpolated
// into raw SQL strings.
// =============================================================================

import { unzipSync, strFromU8 } from 'fflate';

/** Thrown for any user-facing validation failure; message is shown in the UI. */
export class ImportError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ImportError';
	}
}

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

// 20 MB — a campaign's text is a few hundred kB; the rest is artwork. The YRT
// starter alone carries 31 illustrated locations, and a 5 MB ceiling forced
// those down to 800px. Individual images stay bounded by the API's own
// MAX_IMAGE_DATA_URL_LEN (~900 KB decoded), so this caps the archive, not the
// picture.
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_DEPTH = 12; // manifest → data → object → field → …
const MAX_ARRAY_ITEMS = 1000; // generous upper bound
// Matches MAX_BYTES: entity images (NPC/community avatars) are stored inline as
// base64 `data:` URLs, which routinely exceed any small per-string cap — a
// single photo is hundreds of KB. The file-size limit already bounds the whole
// payload, so the per-string guard just forbids a string larger than the
// largest legal file rather than rejecting a valid image.
const MAX_STR_LEN = MAX_BYTES;

// Zip-bomb guard on the total decompressed payload. Set independently of
// MAX_BYTES rather than as a multiple of it: a legitimate archive is mostly
// already-compressed images (which unpack ~1:1) plus one JSON body that is
// itself capped at MAX_BYTES, so 2 × the file cap is the honest ceiling for a
// real export and anything past it is an attack or a mistake.
const MAX_DECOMPRESSED = 40 * 1024 * 1024;

/** Keys that trigger prototype pollution if assigned to a plain object. */
const POISON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Zip import — decompresses a `.zip` produced by `exportZip()` and
// reassembles `imageUrlFile` / `portraitFile` references back into inline
// `imageUrl` / `portrait` data URLs. The result is a plain
// `{ manifest, data }` envelope the rest of the import flow can walk
// like the pre-zip-era JSON exports.
// ---------------------------------------------------------------------------

/** File names the exporter puts at the top of the zip — read in this
 *  order until one is found. `<type>.json` (e.g. `character.json`,
 *  `everything.json`) is the canonical name; `data.json` is a fallback. */
const BODY_CANDIDATES = [
	'everything.json',
	'character.json',
	'characters.json',
	'communities.json',
	'expeditions.json',
	'data.json',
] as const;

interface ZipManifest {
	app?: string;
	version?: string;
	exportedAt?: string;
	type?: string;
	count?: number;
	/** Optional path to the body file inside the zip when the exporter
	 *  wants to name it something other than one of `BODY_CANDIDATES`. */
	body?: string;
}

/** Parse a raw `.zip` byte payload from the file input. Returns the
 *  reassembled + sanitised `{ manifest, data }` envelope. Throws
 *  `ImportError` for any user-facing problem (invalid archive, missing
 *  manifest, oversized body, zip bomb, etc.). */
export function parseImportZip(bytes: Uint8Array): unknown {
	if (bytes.length > MAX_BYTES) {
		throw new ImportError(`File is too large (max ${MAX_BYTES / 1024 / 1024} MB).`);
	}
	let entries: Record<string, Uint8Array>;
	try {
		entries = unzipSync(bytes);
	} catch {
		throw new ImportError('File is not a valid .zip archive.');
	}

	const manifestBytes = entries['manifest.json'];
	if (!manifestBytes) {
		throw new ImportError('Zip is missing manifest.json — is this an Iron Ledger export?');
	}
	let manifest: ZipManifest;
	try {
		manifest = JSON.parse(strFromU8(manifestBytes)) as ZipManifest;
	} catch {
		throw new ImportError('manifest.json is not valid JSON.');
	}

	// Locate the body file — either the exporter's `manifest.body`
	// pointer or the first candidate name that exists in the zip.
	let bodyBytes: Uint8Array | undefined;
	if (typeof manifest.body === 'string') bodyBytes = entries[manifest.body];
	if (!bodyBytes) {
		for (const candidate of BODY_CANDIDATES) {
			if (entries[candidate]) {
				bodyBytes = entries[candidate];
				break;
			}
		}
	}
	if (!bodyBytes) {
		throw new ImportError('Zip is missing its data JSON file — is this a supported export?');
	}
	if (bodyBytes.length > MAX_BYTES) {
		throw new ImportError(`Data payload is too large (max ${MAX_BYTES / 1024 / 1024} MB).`);
	}

	// Total decompressed size cap — protects against a zip bomb where the
	// zip itself is small but the total unpacked payload is enormous.
	let total = 0;
	for (const bytes of Object.values(entries)) {
		total += bytes.length;
		if (total > MAX_DECOMPRESSED) {
			throw new ImportError(
				`Zip decompresses to more than ${MAX_DECOMPRESSED / 1024 / 1024} MB — rejecting.`,
			);
		}
	}

	let body: unknown;
	try {
		body = JSON.parse(strFromU8(bodyBytes));
	} catch {
		throw new ImportError('Data payload inside the zip is not valid JSON.');
	}

	// Reassemble `portraitFile` → `imageUrl` data URLs from `images/*`
	// entries before sanitising, so the reassembled shape matches what
	// legacy JSON imports already produce.
	body = reassemblePortraits(body, entries);

	// Some exports write the body file as a full `{ manifest, data }` envelope
	// (the same shape as manifest.json) rather than the bare payload — e.g. the
	// per-category "Connections" / "Expeditions" zips. Unwrap one level so the
	// rest of the pipeline always sees the raw payload as `data`; otherwise the
	// dispatch reads `parsed.data.communities` off the envelope, finds nothing,
	// and reports a successful import of zero rows. A bare character body is
	// `{ name, data }` — it has `data` but no `manifest` — so this only fires on
	// the doubly-wrapped form.
	if (
		body !== null &&
		typeof body === 'object' &&
		!Array.isArray(body) &&
		'manifest' in body &&
		'data' in body
	) {
		body = (body as { data: unknown }).data;
	}

	// Wrap the reassembled body with the same manifest/data envelope
	// legacy JSON imports use, so the rest of the pipeline is unchanged.
	const envelope = { manifest, data: body };
	return sanitize(envelope, 0);
}

/** Map of `<field>File` reference keys back to the field they
 *  reassemble into. The exporter picks one based on the original
 *  field name (`imageUrl` for community/npc/place/expedition rows,
 *  `portrait` for characters' nested `data.portrait`); the reassembler
 *  reverses the mapping so the reconstituted JSON matches whatever
 *  shape the runtime already expects. */
const PORTRAIT_FIELD_MAP: Record<string, string> = {
	imageUrlFile: 'imageUrl',
	portraitFile: 'portrait',
};

/** Walk `value` and expand every `<field>File: 'images/xyz.jpg'`
 *  reference into a sibling inline `<field>: 'data:image/…;base64,…'`.
 *  Silently drops references that don't resolve — the entity just
 *  imports without a portrait, matching legacy behaviour where a data
 *  URL fetch that returned empty would leave the field blank. */
function reassemblePortraits(value: unknown, entries: Record<string, Uint8Array>): unknown {
	if (value === null || typeof value !== 'object') return value;
	if (Array.isArray(value)) {
		return value.map((v) => reassemblePortraits(v, entries));
	}
	const obj = value as Record<string, unknown>;
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(obj)) {
		const targetField = PORTRAIT_FIELD_MAP[k];
		if (targetField && typeof v === 'string') {
			const bytes = entries[v];
			if (bytes && bytes.length > 0) {
				out[targetField] = bytesToDataUrl(v, bytes);
			}
			// The `<field>File` key itself is dropped — never leaks
			// through to the API.
			continue;
		}
		out[k] = reassemblePortraits(v, entries);
	}
	return out;
}

/** Convert raw image bytes into a `data:<mime>;base64,…` URL. MIME is
 *  derived from the file's extension so PNG portraits stay PNG (a
 *  browser refuses a PNG body served as image/jpeg). Chunks the
 *  fromCharCode call so we don't hit the JS arg-list length limit on
 *  multi-megabyte portraits. */
function bytesToDataUrl(path: string, bytes: Uint8Array): string {
	const ext = (path.split('.').pop() ?? '').toLowerCase();
	const mime =
		ext === 'png'
			? 'image/png'
			: ext === 'webp'
				? 'image/webp'
				: ext === 'gif'
					? 'image/gif'
					: 'image/jpeg';
	let binary = '';
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return `data:${mime};base64,${btoa(binary)}`;
}

/**
 * Strip dangerous HTML from a log entry's `html` field before rendering.
 * Removes script tags, event-handler attributes, and dangerous protocols.
 */
export function sanitizeLogHtml(html: string): string {
	return (
		html
			// Remove <script> blocks (including multiline)
			.replace(/<script\b[\s\S]*?<\/script>/gi, '')
			// Remove dangerous embedding elements
			.replace(/<(iframe|object|embed|link|meta|base)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
			.replace(/<(iframe|object|embed|link|meta|base)\b[^>]*\/?>/gi, '')
			// Remove event-handler attributes (onclick=, onerror=, onload=, …)
			.replace(/\bon\w+\s*=/gi, 'data-removed=')
			// Remove dangerous URL protocols
			.replace(/javascript\s*:/gi, 'removed:')
			.replace(/data\s*:\s*text\/html/gi, 'removed:text/html')
			// Remove vbscript: protocol
			.replace(/vbscript\s*:/gi, 'removed:')
	);
}

// ---------------------------------------------------------------------------
// Internal recursion
// ---------------------------------------------------------------------------

function sanitize(value: unknown, depth: number): unknown {
	if (depth > MAX_DEPTH) {
		throw new ImportError('JSON structure is too deeply nested.');
	}

	if (value === null || value === undefined) return value;

	if (typeof value === 'string') {
		if (value.length > MAX_STR_LEN) {
			throw new ImportError('A string value in the file is too long.');
		}
		return value;
	}

	// Numbers, booleans — pass through
	if (typeof value !== 'object') return value;

	if (Array.isArray(value)) {
		if (value.length > MAX_ARRAY_ITEMS) {
			throw new ImportError(`An array in the file has too many items (max ${MAX_ARRAY_ITEMS}).`);
		}
		return value.map((item) => sanitize(item, depth + 1));
	}

	// Plain object — strip poison keys, recurse into values
	const out: Record<string, unknown> = {};
	for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
		if (POISON_KEYS.has(key)) continue;
		out[key] = sanitize(val, depth + 1);
	}
	return out;
}
