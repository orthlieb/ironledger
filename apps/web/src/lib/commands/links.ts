// =============================================================================
// Iron Ledger — command links (docs/command-language.md → Log links)
//
// In content, a link's target is a command: `[take +1 momentum](/momentum++)`,
// `[Inflict double harm](/foe.progress+=2)`, `[Endure Harm](/move endure-harm)`.
// It renders as `<a class="cmd-link" data-cmd="…">`. When the app writes a log
// entry, each link is bound to it: the entry's id, its place in the entry,
// and the character, foe, expedition, vow and companion the entry was made
// for (plus a harm amount, an action roll, an oracle column). A click runs
// the command against those, not whatever is active then (run.svelte.ts →
// runLink), and the link is struck through, spent.
//
// Pure string work: unit-tested in tests/unit/commandLinks.test.ts.
// =============================================================================

import { parseCommand, type Verb } from './parse.js';

/** What a link acts on beyond its command. */
export interface LinkBinding {
	/** The character the entry was made for. */
	charId?: string;
	/** The foe it was made against. */
	foeId?: string;
	/** The journey, site or scene it was made for. */
	expId?: string;
	/** The vow or companion chosen in the Moves dialog. */
	vowId?: string;
	companionId?: string;
	/** The asset the link's text belongs to (`self`). */
	selfId?: string;
	/** The harm `harm` stands for: Endure Harm's amount, else the foe's. */
	harm?: number;
	/** The action roll a `/burn` link burns momentum on. */
	rollId?: string;
	/** The column an `/oracle` link opens on (Delve the Depths). */
	stat?: string;
}

/** The attribute each binding is kept in. */
const ATTRS: [keyof LinkBinding, string][] = [
	['charId', 'data-char-id'],
	['foeId', 'data-foe-id'],
	['expId', 'data-exp-id'],
	['vowId', 'data-vow-id'],
	['companionId', 'data-companion-id'],
	['selfId', 'data-self-id'],
	['harm', 'data-harm'],
	['rollId', 'data-roll-entry-id'],
	['stat', 'data-stat'],
];

export const CMD_LINK = 'cmd-link';

const attr = (v: string) =>
	v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unattr = (v: string) =>
	v
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');

function bindingAttrs(bind: LinkBinding, have: Set<string> = new Set()): string {
	let out = '';
	for (const [k, a] of ATTRS) {
		const v = bind[k];
		if (v === undefined || v === '' || have.has(a)) continue;
		out += ` ${a}="${attr(String(v))}"`;
	}
	return out;
}

/** A command link. `labelHtml` is already HTML (escape text first). The
 *  class comes first, so bindCommandLinks finds it. */
export function commandLinkHtml(labelHtml: string, cmd: string, bind: LinkBinding = {}): string {
	// `data-verb` marks a link that opens something (a move, an oracle), so
	// a dialog can leave those live and make value links inert.
	const verb = linkVerb(cmd);
	const kind = verb ? ` data-verb="${verb.verb}"` : '';
	return `<a class="${CMD_LINK}" data-cmd="${attr(cmd)}"${kind}${bindingAttrs(bind)}>${labelHtml}</a>`;
}

/** Bind every command link in an entry's HTML to it: the entry's id, each
 *  link's place in the entry (`data-link`, so the one clicked is the one
 *  struck when two links read alike), and whatever binding a link doesn't
 *  carry already. */
export function bindCommandLinks(html: string, entryId: string, bind: LinkBinding = {}): string {
	let i = 0;
	return html.replace(/<a class="cmd-link"([^>]*)>/g, (_m, rest: string) => {
		const have = new Set([...rest.matchAll(/\s(data-[a-z-]+)=/g)].map((x) => x[1]!));
		let add = '';
		if (!have.has('data-entry-id')) add += ` data-entry-id="${attr(entryId)}"`;
		if (!have.has('data-link')) add += ` data-link="${i}"`;
		i++;
		add += bindingAttrs(bind, have);
		return `<a class="${CMD_LINK}"${rest}${add}>`;
	});
}

/** A clicked link's command, binding, entry and place in it. */
export function readCommandLink(el: HTMLElement): {
	cmd: string;
	bind: LinkBinding;
	entryId: string;
	index: number | undefined;
} {
	const d = el.dataset;
	const harm = d['harm'];
	const bind: LinkBinding = {
		charId: d['charId'] || undefined,
		foeId: d['foeId'] || undefined,
		expId: d['expId'] || undefined,
		vowId: d['vowId'] || undefined,
		companionId: d['companionId'] || undefined,
		selfId: d['selfId'] || undefined,
		harm: harm != null && harm !== '' && Number.isFinite(Number(harm)) ? Number(harm) : undefined,
		rollId: d['rollEntryId'] || undefined,
		stat: d['stat'] || undefined,
	};
	const link = d['link'];
	return {
		cmd: d['cmd'] ?? '',
		bind,
		entryId: d['entryId'] || el.closest('.log-entry')?.getAttribute('data-entry-id') || '',
		index: link != null && link !== '' ? Number(link) : undefined,
	};
}

/** Strike a spent link through in an entry's HTML: the link at that place,
 *  or, unbound, the first with that command. */
export function spendCommandLink(html: string, index: number | undefined, cmd: string): string {
	const re =
		index !== undefined
			? new RegExp(`<a class="cmd-link"(?=[^>]*\\sdata-link="${index}")[^>]*>([\\s\\S]*?)</a>`)
			: new RegExp(
					`<a class="cmd-link"(?=[^>]*\\sdata-cmd="${attr(cmd).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}")[^>]*>([\\s\\S]*?)</a>`,
				);
	return html.replace(re, (_m, inner: string) => `<s class="resource-spent">${inner}</s>`);
}

/** A link's verb, if its command is one (`/move …`, `/oracle …`). */
export function linkVerb(cmd: string): { verb: Verb; arg: string } | null {
	const p = parseCommand(cmd);
	return p.kind === 'verb' ? { verb: p.verb, arg: p.arg } : null;
}

/** Each command link in some HTML, for checks: its command and label. */
export function commandLinksIn(html: string): { cmd: string; label: string }[] {
	return [
		...html.matchAll(/<a class="cmd-link"[^>]*\sdata-cmd="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g),
	].map((m) => ({ cmd: unattr(m[1]!), label: m[2]! }));
}
