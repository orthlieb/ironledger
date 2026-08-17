// =============================================================================
// Iron Ledger — Interactive-link DSL for moves & oracles (proof of concept)
//
// Authors write markdown links `[label](scheme:path?query)`; this maps the
// known schemes to the app's interactive `<a class="…" data-…>` HTML (which
// `enrichOutcomeLinks` / `resolveHarmLinks` then wire up), and `[text]{.class}`
// to a class-tagged span (e.g. `.log-only`).
//
// Query args are parsed **leniently** — `+` stays literal (NOT decoded to a
// space, as a strict query string would). Resolution happens here on the raw
// href, never on serialized HTML, so the `&` between args is never seen as
// `&amp;`.
// =============================================================================

import { renderNote } from './markdown.js';

export interface DslRef {
	scheme: string;
	path: string;
	args: Record<string, string>;
}

/** Parse a DSL href `scheme:path?a=1&b=+2` → `{ scheme, path, args }`. Lenient:
 *  no percent-decoding, `+` kept literal. */
export function parseDslHref(href: string): DslRef {
	const colon = href.indexOf(':');
	const scheme = colon < 0 ? href : href.slice(0, colon);
	let rest = colon < 0 ? '' : href.slice(colon + 1);
	let query = '';
	const q = rest.indexOf('?');
	if (q >= 0) {
		query = rest.slice(q + 1);
		rest = rest.slice(0, q);
	}
	const args: Record<string, string> = {};
	if (query) {
		for (const pair of query.split('&')) {
			const eq = pair.indexOf('=');
			if (eq < 0) args[pair] = '';
			else args[pair.slice(0, eq)] = pair.slice(eq + 1); // no decode — `+` literal
		}
	}
	return { scheme, path: rest, args };
}

const attr = (v: string): string => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const esc = (s: string): string =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Map one DSL action link to the app's interactive HTML. Class is emitted
 *  **first** so `enrichOutcomeLinks`' `<a\s+class="…"` regex still matches.
 *  Returns null for a scheme this map doesn't own (e.g. `roll:`, handled by the
 *  oracle renderer) so the caller can leave the token untouched. */
export function dslActionLink(label: string, ref: DslRef): string | null {
	const { scheme, path, args } = ref;
	const L = esc(label);
	switch (scheme) {
		case 'move': {
			const harm = args.harm ? ` data-harm="${attr(args.harm)}"` : '';
			return `<a class="move-link" data-id="move/${attr(path)}"${harm}>${L}</a>`;
		}
		case 'resource':
			return `<a class="resource-link" data-resource="${attr(path)}" data-value="${attr(args.value ?? '')}">${L}</a>`;
		case 'progress':
			return `<a class="progress-link" data-track="${attr(path)}" data-value="${attr(args.value ?? '')}">${L}</a>`;
		case 'debility':
			return `<a class="debility-link" data-debility="${attr(path)}" data-value="${attr(args.value ?? '')}">${L}</a>`;
		case 'initiative':
			return `<a class="initiative-link" data-value="${attr(path)}">${L}</a>`;
		case 'menace':
			return `<a class="menace-link" data-value="${attr(path)}">${L}</a>`;
		case 'oracle':
			return `<a class="oracle-link" data-oracle="${attr(path)}">${L}</a>`;
		case 'reset':
			return `<a class="reset-track-link" data-track="${attr(path)}">${L}</a>`;
		case 'harm':
			return `<a class="harm-link" data-resource="${attr(path)}">${L}</a>`;
		case 'vanquish':
			return `<a class="vanquish-foe-link">${L}</a>`;
		default:
			return null;
	}
}

// Placeholder sentinels (private-use chars) survive renderNote's escaping +
// inline pass untouched — so we protect resolved HTML, format, then restore.
const P0 = '';
const P1 = '';
const LINK = /\[([^\]]+)\]\(([^)]+)\)/g; // [label](href)
const SPAN = /\[([^\]]+)\]\{\.([\w-]+)\}/g; // [text]{.class}

/** Render markdown+DSL text (moves, oracles, assets) to HTML: resolve DSL action
 *  links + `{.class}` spans, then apply renderNote formatting (bold, lists).
 *  Interactive link HTML is protected behind sentinels so renderNote never
 *  escapes it. */
export function renderRich(md: string | undefined): string {
	if (!md) return '';
	const stash: string[] = [];
	const protect = (html: string): string => `${P0}${stash.push(html) - 1}${P1}`;
	let s = md.replace(LINK, (m, label: string, href: string) => {
		const html = dslActionLink(label, parseDslHref(href));
		return html == null ? m : protect(html);
	});
	s = s.replace(SPAN, (m, text: string, cls: string) =>
		cls === 'log-only' ? protect(`<span class="log-only">${esc(text)}</span>`) : m,
	);
	return renderNote(s).replace(
		new RegExp(`${P0}(\\d+)${P1}`, 'g'),
		(_m, i: string) => stash[Number(i)],
	);
}
