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

// Exported so tests can assert the allowlist contains every attribute / tag that
// interactive log links depend on — see tests/unit/sanitize.test.ts.
export const LOG_TAGS = [
	'a', 'span', 'div', 'p', 'br', 'strong', 'em', 'code', 'ul', 'ol', 'li',
	's',   // <s class="resource-spent"> / <s class="xp-spent"> — written by markLinkSpent
];

export const LOG_ATTRS = [
	'class',
	'href',              // move-links sometimes point somewhere; xp/failure links use href="#"

	// ── Shared across multiple link types ──────────────────────────────────
	'data-value',        // resource-link, progress-link, initiative-link, menace-link
	'data-entry-id',     // all stateful links (for markLinkSpent + guard checks)
	'data-char-id',      // resource-link, debility-link, failure-link, burn-momentum-link, xp-cost-link

	// ── Per-link-type data attributes ──────────────────────────────────────
	'data-resource',     // resource-link  — which stat to change (momentum, health, …)
	'data-track',        // progress-link  — which track to mark (combat, journey, delve, …)
	'data-debility',     // debility-link  — which debility to set/clear
	'data-id',           // move-link      — move id to open in MovesDialog
	'data-oracle',       // oracle-link    — oracle key to open in OraclesDialog
	'data-stat',         // oracle-link    — stat column pre-selected in the oracle
	'data-expedition-id',// change-theme/domain-link — which expedition to modify
	'data-cost',         // xp-cost-link   — XP amount to deduct
	'data-roll-entry-id',// burn-momentum-link — id of the original roll log entry
	'data-move-id',      // burn-momentum-link — move id (used by burnMomentum)
	'data-action-score', // burn-momentum-link — action score (used by burnMomentum)
	'data-menace',       // kept for forward compat; menace-link currently uses data-value
	'data-xp',           // kept for backwards compat with old saved log entries
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
