// =============================================================================
// Iron Ledger — Import Sanitizer
//
// Validates and sanitizes untrusted JSON from imported files before any of it
// is sent to the API or rendered in the UI.
//
// Threat model:
//   • Prototype pollution  — __proto__ / constructor / prototype keys stripped
//   • XSS via log HTML     — script tags and event-handler attrs removed
//   • DoS via huge payloads — file-size, depth, and array-length limits
//   • Invalid JSON          — caught and re-thrown as ImportError (user-facing)
//
// SQL injection is NOT a concern here: the API layer uses Drizzle ORM with
// parameterized queries, and data is stored as JSONB blobs, never interpolated
// into raw SQL strings.
// =============================================================================

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

const MAX_BYTES       = 5 * 1024 * 1024; // 5 MB — enough for any real campaign
const MAX_DEPTH       = 12;              // manifest → data → object → field → …
const MAX_ARRAY_ITEMS = 1000;            // generous upper bound
const MAX_STR_LEN     = 200_000;         // ~200k chars per string field

/** Keys that trigger prototype pollution if assigned to a plain object. */
const POISON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse and sanitize a raw import file string.
 * Throws `ImportError` for any user-facing problem (bad JSON, too large, etc.).
 * Returns the sanitized value — always safe to pass to the API or render.
 */
export function parseImportJson(text: string): unknown {
	if (text.length > MAX_BYTES) {
		throw new ImportError(`File is too large (max ${MAX_BYTES / 1024 / 1024} MB).`);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new ImportError('File is not valid JSON.');
	}
	return sanitize(parsed, 0);
}

/**
 * Strip dangerous HTML from a log entry's `html` field before rendering.
 * Removes script tags, event-handler attributes, and dangerous protocols.
 */
export function sanitizeLogHtml(html: string): string {
	return html
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
		.replace(/vbscript\s*:/gi, 'removed:');
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
			throw new ImportError(
				`An array in the file has too many items (max ${MAX_ARRAY_ITEMS}).`,
			);
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
