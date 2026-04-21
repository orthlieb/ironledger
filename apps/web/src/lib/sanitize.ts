/**
 * HTML sanitisation for user-influenced content.
 *
 * Two bindings in the app render arbitrary HTML:
 *
 *   - Session log entries (LogPanel, RollToast) — constructed by code from
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
 * attributes that drive the interactive log-links (resource / move /
 * oracle / progress / initiative / debility / menace / burn / xp-cost),
 * and the handful of CSS classes used to style them.
 */
import DOMPurify from 'isomorphic-dompurify';

const LOG_TAGS = [
	'a', 'span', 'div', 'p', 'br', 'strong', 'em', 'code', 'ul', 'ol', 'li',
];

const LOG_ATTRS = [
	'class',
	'href',              // move-links sometimes point somewhere
	'data-value',
	'data-resource',
	'data-id',
	'data-oracle',
	'data-entry-id',
	'data-char-id',
	'data-expedition-id',
	'data-menace',
	'data-xp',
];

export function sanitizeLogHtml(html: string | null | undefined): string {
	if (!html) return '';
	return DOMPurify.sanitize(html, {
		ALLOWED_TAGS: LOG_TAGS,
		ALLOWED_ATTR: LOG_ATTRS,
		ALLOW_DATA_ATTR: false,   // explicit allowlist above, no implicit data-*
		ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|#|\/)/i,  // no javascript:, data: in href
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
		ALLOWED_ATTR: [],          // notes have no interactive attrs
	});
}
