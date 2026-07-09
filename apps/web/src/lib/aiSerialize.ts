// =============================================================================
// Iron Ledger — AI log serializer
//
// Convert a range of LogEntry rows (newest-first, as stored) into the plain
// text we send to Claude for prose generation.
//
// Two rules from the design:
//   • Log is stored newest-first — reverse before serializing so events flow
//     chronologically in the prompt.
//   • Move outcomes offer choices as <li> items containing an <a> action link.
//     Clicking the link marks the choice as taken (link replaced with
//     <s class="resource-spent">). Unstruck links are alternatives the player
//     did NOT take — drop those items entirely. Keep struck items and any
//     narrative <li> that has no action link at all.
// =============================================================================

import type { LogEntry } from './log.svelte.js';

/** Link classes that represent a takeable choice/action in a move outcome. */
const ACTION_LINK_CLASSES = [
	'resource-link',
	'debility-link',
	'progress-link',
	'initiative-link',
	'menace-link',
	'vanquish-foe-link',
	'burn-momentum-link',
	'reset-track-link',
	'change-theme-link',
	'change-domain-link',
	'failure-link',
	'xp-cost-link',
];

const ACTION_SELECTOR = ACTION_LINK_CLASSES.map((c) => `a.${c}`).join(', ');

/** True if the element (or any descendant) contains an unstruck action link. */
function hasUnstruckAction(el: Element): boolean {
	return el.querySelector(ACTION_SELECTOR) !== null;
}

/** True if the element (or any descendant) has a strikethrough / spent marker. */
function hasStrike(el: Element): boolean {
	return el.querySelector('s, strike, del, .resource-spent, .xp-spent') !== null;
}

/** Normalize whitespace: collapse runs, trim edges. */
function tidy(s: string): string {
	return s.replace(/\s+/g, ' ').trim();
}

/**
 * Convert one entry's HTML body to plain text for the prompt.
 *
 * `document` is passed in so this remains pure and testable via happy-dom.
 */
export function entryBodyToPrompt(html: string, doc: Document): string {
	const tmp = doc.createElement('div');
	tmp.innerHTML = html;

	// Drop dialog-only decorations (they're hidden in the log anyway).
	tmp.querySelectorAll('.dialog-only').forEach((n) => n.remove());

	// For each <li>: if it has an unstruck action link AND no strike marker, drop it.
	// (An <li> with BOTH a link and a strike is an edge case — keep the strike wins.)
	tmp.querySelectorAll('li').forEach((li) => {
		if (hasUnstruckAction(li) && !hasStrike(li)) li.remove();
	});

	// If any bare (non-<li>) container has an unstruck action link followed by no
	// other narrative content, strip the link's inner text so we don't say "click
	// here" in the story. Keep the surrounding paragraph text.
	tmp.querySelectorAll(ACTION_SELECTOR).forEach((a) => {
		// Only unstruck ones survived to this point; blank the link.
		a.textContent = '';
	});

	// Walk block-level elements to emit lines.
	const lines: string[] = [];

	function pushBlock(node: Node) {
		if (node.nodeType === 3 /* TEXT_NODE */) {
			const t = tidy(node.textContent ?? '');
			if (t) lines.push(t);
			return;
		}
		if (node.nodeType !== 1 /* ELEMENT_NODE */) return;
		const el = node as HTMLElement;
		const tag = el.tagName.toLowerCase();

		if (tag === 'ul' || tag === 'ol') {
			el.querySelectorAll(':scope > li').forEach((li) => {
				const t = tidy(li.textContent ?? '');
				if (t) lines.push(`- ${t}`);
			});
			return;
		}
		if (tag === 'br') return;

		// Block-ish elements: emit their text as a single line.
		if (['div', 'p', 'h1', 'h2', 'h3', 'h4', 'blockquote'].includes(tag)) {
			// If the block only contains child blocks, recurse; otherwise flatten.
			const childBlocks = Array.from(el.children).filter((c) =>
				['div', 'p', 'ul', 'ol', 'blockquote'].includes(c.tagName.toLowerCase()),
			);
			if (childBlocks.length > 0) {
				el.childNodes.forEach(pushBlock);
			} else {
				const t = tidy(el.textContent ?? '');
				if (t) lines.push(t);
			}
			return;
		}

		// Inline element at top level — join with prior line or start one.
		const t = tidy(el.textContent ?? '');
		if (t) lines.push(t);
	}

	tmp.childNodes.forEach(pushBlock);

	return lines.filter((l) => l.length > 0).join('\n');
}

/** Format a single entry as a titled block for the prompt. */
export function serializeEntry(entry: LogEntry, doc: Document): string {
	const body = entryBodyToPrompt(entry.html, doc);
	const time = new Date(entry.ts).toLocaleString(undefined, {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
	const parts = [`## ${entry.title} — ${time}`];
	if (body) parts.push(body);
	if (entry.note?.trim()) {
		parts.push('');
		parts.push('Note: ' + tidy(entry.note));
	}
	return parts.join('\n');
}

/**
 * Serialize a slice of the log (newest-first as stored) into chronological
 * prose input for the AI.
 *
 * Pass the `document` from the browser (or a happy-dom document in tests).
 */
export function serializeLogSection(entries: LogEntry[], doc: Document): string {
	if (entries.length === 0) return '';
	const chronological = [...entries].reverse();
	return chronological.map((e) => serializeEntry(e, doc)).join('\n\n');
}

/** Rough token estimate for the preview strip: ~4 chars per token. */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

// =============================================================================
// Cast & setting preface
//
// Optional context prepended to the prompt so the model knows who the player
// character is and what they're up against, instead of inferring identity from
// dice rolls. Pure and testable — the caller (StoryDialog) reads the live
// character/foe from the stores and passes plain data in.
// =============================================================================

export interface PrefaceVow {
	name: string;
	difficulty: string;
	/** What the vow is sworn against / to do. */
	threat: string;
}

export interface PrefaceCharacter {
	name: string;
	background: string;
	/** Resolved asset names (e.g. "Swordmaster", "Ritualist"). */
	assets: string[];
	vows: PrefaceVow[];
}

export interface PrefaceFoe {
	name: string;
	nature: string;
	rank: number;
	description: string;
	notes: string;
}

export interface PrefaceExpedition {
	name: string;
	kind: 'journey' | 'site';
	difficulty: string;
	/** Site only. */
	theme?: string;
	/** Site only. */
	domain?: string;
	/** Site only. */
	objective?: string;
	notes: string;
}

// ---------------------------------------------------------------------------
// Section scanning — which entities does the captured log actually reference?
// The caller passes candidate entities from the stores; these helpers decide
// which are mentioned so the preface only describes what appears in the story.
// ---------------------------------------------------------------------------

/**
 * Flatten a log section (titles + visible body text + notes) into one
 * lowercased blob for name-mention scanning. `doc` is injected for testability.
 */
export function sectionText(entries: LogEntry[], doc: Document): string {
	const parts: string[] = [];
	for (const e of entries) {
		parts.push(e.title ?? '');
		const tmp = doc.createElement('div');
		tmp.innerHTML = e.html ?? '';
		parts.push(tmp.textContent ?? '');
		if (e.note) parts.push(e.note);
	}
	return parts.join(' \n ').toLowerCase();
}

/**
 * True if `name` appears in the already-lowercased section text as a
 * word-bounded, case-insensitive match. Names under 2 chars are ignored
 * (too noisy to match reliably).
 */
export function mentions(sectionLower: string, name: string): boolean {
	const n = name.trim().toLowerCase();
	if (n.length < 2) return false;
	let from = 0;
	for (;;) {
		const idx = sectionLower.indexOf(n, from);
		if (idx === -1) return false;
		const before = sectionLower[idx - 1];
		const after = sectionLower[idx + n.length];
		const okBefore = before === undefined || !/[a-z0-9]/.test(before);
		const okAfter = after === undefined || !/[a-z0-9]/.test(after);
		if (okBefore && okAfter) return true;
		from = idx + 1;
	}
}

/**
 * Distinct values of a roll-metadata id field across a section — used for
 * exact foe/expedition matching (`roll.foeId` / `roll.expeditionId`), which
 * combat and journey/delve action rolls now record.
 */
export function referencedRollIds(entries: LogEntry[], field: 'foeId' | 'expeditionId'): string[] {
	const ids = new Set<string>();
	for (const e of entries) {
		const v = e.roll?.[field];
		if (v) ids.add(v);
	}
	return [...ids];
}

/**
 * Character ids referenced in a section — from roll metadata (`roll.charId`)
 * and any `data-char-id` attributes on interactive links. These are exact ids,
 * so they're more reliable than name matching for the player characters.
 */
export function referencedCharIds(entries: LogEntry[], doc: Document): string[] {
	const ids = new Set<string>();
	for (const e of entries) {
		if (e.roll?.charId) ids.add(e.roll.charId);
		const tmp = doc.createElement('div');
		tmp.innerHTML = e.html ?? '';
		tmp.querySelectorAll('[data-char-id]').forEach((el) => {
			const id = el.getAttribute('data-char-id');
			if (id) ids.add(id);
		});
	}
	return [...ids];
}

// ---------------------------------------------------------------------------
// Story entry payload — stored as JSON in a Story log entry's `source`. Carries
// the exact prompt (for Regenerate) and the raw markdown (for Export). The
// `kind` discriminator is how a Story entry is identified regardless of its
// user-chosen title.
// ---------------------------------------------------------------------------

export interface StorySource {
	kind: 'story';
	system?: string;
	user: string;
	model?: string;
	/** Raw markdown the model produced — used for the markdown export. */
	md?: string;
}

/** Parse a log entry's `source` as a Story payload, or null if it isn't one. */
export function parseStorySource(source: string | null | undefined): StorySource | null {
	if (!source) return null;
	try {
		const p = JSON.parse(source);
		if (p && p.kind === 'story' && typeof p.user === 'string') return p as StorySource;
	} catch {
		/* not JSON → not a story */
	}
	return null;
}

// ---------------------------------------------------------------------------
// Preface rendering
// ---------------------------------------------------------------------------

function characterBlock(c: PrefaceCharacter): string {
	const lines = [`**${tidy(c.name)}** — player character.`];
	if (c.background.trim()) lines.push(tidy(c.background));
	const assets = c.assets.map((a) => tidy(a)).filter(Boolean);
	if (assets.length) lines.push(`Assets: ${assets.join(', ')}.`);
	const vows = c.vows
		.filter((v) => v.name.trim())
		.map((v) => {
			const bits = [v.difficulty.trim(), v.threat.trim() ? `against ${tidy(v.threat)}` : '']
				.filter(Boolean)
				.join(', ');
			return bits ? `${tidy(v.name)} (${bits})` : tidy(v.name);
		});
	if (vows.length) lines.push(`Vows: ${vows.join('; ')}.`);
	return lines.join('\n');
}

function foeBlock(f: PrefaceFoe): string {
	const meta = [f.nature.trim(), f.rank ? `rank ${f.rank}` : ''].filter(Boolean).join(', ');
	const lines = [meta ? `**${tidy(f.name)}** — ${meta} foe.` : `**${tidy(f.name)}** — foe.`];
	if (f.description.trim()) lines.push(tidy(f.description));
	if (f.notes.trim()) lines.push(tidy(f.notes));
	return lines.join('\n');
}

function expeditionBlock(e: PrefaceExpedition): string {
	const kindWord = e.kind === 'site' ? 'site' : 'journey';
	const diff = e.difficulty.trim();
	const lines = [
		diff ? `**${tidy(e.name)}** — ${diff} ${kindWord}.` : `**${tidy(e.name)}** — ${kindWord}.`,
	];
	const meta = [
		e.theme?.trim() ? `Theme: ${tidy(e.theme)}` : '',
		e.domain?.trim() ? `Domain: ${tidy(e.domain)}` : '',
	].filter(Boolean);
	if (meta.length) lines.push(`${meta.join('. ')}.`);
	if (e.objective?.trim()) lines.push(`Objective: ${tidy(e.objective)}`);
	if (e.notes.trim()) lines.push(tidy(e.notes));
	return lines.join('\n');
}

/**
 * Compact one-liner for the preview strip, e.g.
 * "Beepalache vs Blood Thorn · Blackroot Barrow".
 */
export function castSummary(
	characters: PrefaceCharacter[],
	foes: PrefaceFoe[],
	expeditions: PrefaceExpedition[],
): string {
	const chars = characters
		.map((c) => c.name.trim())
		.filter(Boolean)
		.join(', ');
	const foeNames = foes
		.map((f) => f.name.trim())
		.filter(Boolean)
		.join(', ');
	const cast = [chars, foeNames].filter(Boolean).join(' vs ');
	const place = expeditions
		.map((e) => e.name.trim())
		.filter(Boolean)
		.join(', ');
	if (cast && place) return `${cast} · ${place}`;
	return cast || place || '';
}

/**
 * Build the "Cast & setting" markdown block from every referenced entity.
 * Returns '' when there is nothing to describe, so the caller can prepend
 * unconditionally. Blocks are ordered characters → foes → expeditions.
 */
export function buildStoryPreface(
	characters: PrefaceCharacter[],
	foes: PrefaceFoe[],
	expeditions: PrefaceExpedition[],
): string {
	const blocks: string[] = [
		...characters.filter((c) => c.name.trim()).map(characterBlock),
		...foes.filter((f) => f.name.trim()).map(foeBlock),
		...expeditions.filter((e) => e.name.trim()).map(expeditionBlock),
	];
	if (blocks.length === 0) return '';
	return `# Cast & setting\n\n${blocks.join('\n\n')}`;
}
