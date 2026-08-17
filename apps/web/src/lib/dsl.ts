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
// Label forbids `[` too, so an OUTER `[…]{.class}` span's bracket can't be
// swallowed into a link label when the span wraps a `[label](href)` link.
const LINK = /\[([^[\]]+)\]\(([^)]+)\)/g; // [label](href)
const SPAN = /\[([^\]]+)\]\{\.([\w-]+)\}/g; // [text]{.class}
/** Display-context spans an author may tag: `log-only` (log entries only),
 *  `dialog-only` (the move/asset dialog only). Keep in sync with lint-dsl.mjs. */
const SPAN_CLASSES = new Set(['log-only', 'dialog-only']);

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
		SPAN_CLASSES.has(cls) ? protect(`<span class="${cls}">${esc(text)}</span>`) : m,
	);
	// Restore protected HTML. Loop until stable: a `{.class}` span can wrap a
	// `[label](href)` link, so its stashed HTML embeds inner sentinels that only
	// surface once the outer span sentinel is replaced (String.replace is 1-pass).
	const restore = new RegExp(`${P0}(\\d+)${P1}`, 'g');
	let out = renderNote(s);
	for (let i = 0; i < 100 && out.includes(P0); i++) {
		out = out.replace(restore, (_m, n: string) => stash[Number(n)]);
	}
	return out;
}

// =============================================================================
// Oracle `roll:` templates — a value blank filled by rolling another oracle.
//
// `[label](roll:key?rollFrom=1&rollTo=3)` / `roll:self?times=2`. `self` = the
// current oracle (the Roll Twice mechanic). Kept here with the rest of the DSL
// and injected with a `rollFn`, so it stays pure/testable out of the runes-based
// oracle store.
// =============================================================================

/** Roll one oracle by key at a recursion depth → its d100 roll + text value. */
export type RollFn = (key: string, depth: number) => { roll: number; value: string };

/** Global matcher for `[label](roll:spec)` — use with `.replace` only (stateful). */
export const ROLL_DSL = /\[([^\]]+)\]\(roll:([^)]+)\)/g;

/** True when a value carries a `[label](roll:…)` blank. */
export const hasRollTemplate = (s: string): boolean => /\]\(roll:/.test(s);

/** Parse a scheme-stripped `roll:` spec (`key?rollFrom=1&rollTo=3`) into a
 *  concrete roll: target oracle, count, the dossier line style, and an optional
 *  count-note for a rolled range. `times=n` = fixed; `rollFrom`/`rollTo` = range. */
export function parseRollSpec(
	spec: string,
	currentKey: string,
): { refKey: string; count: number; dash: boolean; isSelf: boolean; note: string } {
	const { path: key, args } = parseDslHref('roll:' + spec);
	const isSelf = key === 'self';
	const refKey = isSelf ? currentKey : key;
	let count = 1;
	let isRange = false;
	let note = '';
	if (args.times != null) {
		count = parseInt(args.times, 10) || 1;
	} else if (args.rollFrom != null || args.rollTo != null) {
		const lo = parseInt(String(args.rollFrom ?? args.rollTo), 10);
		const hi = parseInt(String(args.rollTo ?? args.rollFrom), 10);
		count = lo + Math.floor(Math.random() * (hi - lo + 1));
		if (lo !== hi) {
			isRange = true;
			note = `${lo === 1 ? `d${hi}` : `${lo}–${hi}`} → ${count}`;
		}
	}
	return { refKey, count, dash: isSelf || count > 1 || isRange, isSelf, note };
}

/** The "×n" badge for a roll: DSL pill, from its query args (empty for count 1). */
export function pillBadge(spec: string): string {
	const { args } = parseDslHref('roll:' + spec);
	if (args.times != null && Number(args.times) > 1) return args.times;
	if (args.rollFrom != null || args.rollTo != null) {
		const lo = args.rollFrom ?? args.rollTo;
		const hi = args.rollTo ?? args.rollFrom;
		return lo === hi ? String(lo) : `${lo}–${hi}`;
	}
	return '';
}

/** Render `[label](roll:…)` blanks as styled pills for the reference table — the
 *  authored label plus an optional "×n" badge. */
export function linkifyTemplate(s: string): string {
	return s.replace(ROLL_DSL, (_m, label: string, spec: string) => {
		const pill = `<span class="oracle-ref">${label}</span>`;
		const badge = pillBadge(spec);
		return badge ? `${pill}<span class="oracle-ref-rep">×${badge}</span>` : pill;
	});
}

/** Fill `[label](roll:…)` blanks by rolling the referenced oracle(s) via `rollFn`.
 *  `self` resolves to `currentKey` (both results occur — no dedupe, the Roll Twice
 *  mechanic); named refs dedupe repeats (distinct picks). Recursion is
 *  depth-guarded (≥5 stops). Returns the composed string + per-roll log lines. */
export function fillTemplate(
	template: string,
	currentKey: string,
	rollFn: RollFn,
	depth: number,
): { filled: string; lines: string[] } {
	const lines: string[] = [];
	const rollRef = (
		refKey: string,
		label: string,
		count: number,
		dash: boolean,
		isSelf: boolean,
	) => {
		const vals: string[] = [];
		for (let i = 0; i < count && depth < 5; i++) {
			const sub = rollFn(refKey, depth + 1);
			const v = sub.value || `[${refKey}]`;
			if (!isSelf && vals.includes(v)) continue; // dedupe named refs only
			vals.push(v);
			lines.push(
				dash
					? `<div class="roll-line">— <strong>${v}</strong> (d100 → ${sub.roll})</div>`
					: `<div class="roll-line">${label}: <strong>${v}</strong> (d100 → ${sub.roll})</div>`,
			);
		}
		return vals.join(', ');
	};

	const filled = template.replace(ROLL_DSL, (_m, label: string, spec: string) => {
		const { refKey, count, dash, isSelf, note } = parseRollSpec(spec, currentKey);
		if (note) lines.push(`<div class="roll-line">${label}: (${note})</div>`);
		return rollRef(refKey, label, count, dash, isSelf);
	});
	return { filled, lines };
}
