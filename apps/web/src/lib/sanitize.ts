/**
 * HTML sanitisation for user-influenced content.
 *
 * Two bindings in the app render arbitrary HTML:
 *
 *   - Session log entries (LogPanel) — constructed by code from
 *     template literals that interpolate user-controlled values like
 *     character names, foe names, asset names. Every one of those
 *     interpolations is a potential XSS vector if a dev forgets to escape.
 *
 *   - Notes (renderNote output) — the renderer already escapes user text
 *     at the leaf, but an extra pass here is free defence-in-depth.
 *
 * We use isomorphic-dompurify so this works both on the SvelteKit server
 * (SSR) and the client (hydration + subsequent renders).
 *
 * The log allowlist is deliberately tight: only the tags and attributes
 * the log templates actually need. In particular we permit the `data-*`
 * attributes of a command link (#lib/commands/links.ts): its command and
 * what it's bound to. A link saved in an older form loses its data
 * attributes here, which is fine: old links do nothing now.
 */
import DOMPurify from 'isomorphic-dompurify';

// Exported so tests can assert the allowlist contains every attribute / tag that
// interactive log links depend on — see tests/unit/sanitize.test.ts.
export const LOG_TAGS = [
	'a',
	'span',
	'div',
	'p',
	'br',
	'strong',
	'em',
	'code',
	'ul',
	'ol',
	'li',
	'h3', // renderNote emits <h3>/<h4>/<h5> for # / ## / ### — used by AI story
	'h4', //   entries (and any markdown note surfaced in the log). Without these
	'h5', //   the heading text would survive but flatten to a plain line.
	's', // <s class="resource-spent"> — a spent link (spendCommandLink)
];

export const LOG_ATTRS = [
	'class',
	'href',

	// ── A command link (#lib/commands/links.ts) ────────────────────────────
	'data-cmd', // the command a click runs: `/momentum++`, `/move endure-harm`
	'data-verb', // `move` / `oracle`: a link that opens something (live in dialogs)
	'data-link', // its place in the entry, so the one clicked is the one struck
	'data-entry-id', // the entry it belongs to
	// What it's bound to — the entry's character, foe and expedition, the
	// vow or companion its move chose, the asset it belongs to, the harm it
	// was made with, the roll a burn is for, the oracle column to open on.
	'data-char-id',
	'data-foe-id',
	'data-exp-id',
	'data-vow-id',
	'data-companion-id',
	'data-self-id',
	'data-harm',
	'data-roll-entry-id',
	'data-stat',
];

export function sanitizeLogHtml(html: string | null | undefined): string {
	if (!html) return '';
	// NOTE: Do NOT set ALLOWED_URI_REGEXP here. The combination of
	// ALLOW_DATA_ATTR:false + ALLOWED_URI_REGEXP causes DOMPurify to strip ALL
	// data-* attributes (even explicitly listed ones). DOMPurify's built-in URI
	// protection already blocks javascript: and data: hrefs by default.
	return DOMPurify.sanitize(html, {
		ALLOWED_TAGS: LOG_TAGS,
		ALLOWED_ATTR: LOG_ATTRS,
		ALLOW_DATA_ATTR: false, // explicit allowlist above, no implicit data-*
	});
}

/**
 * Note-body sanitiser. Consumed after renderNote() has already escaped
 * user text at the leaves — this strips anything weird renderNote might
 * have missed (malformed input, future bug). Allows a broader set of
 * formatting tags than the log.
 */
const NOTE_TAGS = ['p', 'br', 'strong', 'em', 'code', 'ul', 'ol', 'li', 'h3', 'h4', 'h5'];

export function sanitizeNoteHtml(html: string | null | undefined): string {
	if (!html) return '';
	return DOMPurify.sanitize(html, {
		ALLOWED_TAGS: NOTE_TAGS,
		ALLOWED_ATTR: [], // notes have no interactive attrs
	});
}
