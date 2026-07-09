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

export interface PrefaceCharacter {
	name: string;
	background: string;
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

/**
 * Compact one-liner for the preview strip, e.g.
 * "Beepalache vs Blood Thorn · Blackroot Barrow".
 */
export function castSummary(
	character: PrefaceCharacter | null,
	foe: PrefaceFoe | null,
	expedition: PrefaceExpedition | null = null,
): string {
	const cast = [character?.name.trim(), foe?.name.trim()].filter(Boolean).join(' vs ');
	const place = expedition?.name.trim();
	if (cast && place) return `${cast} · ${place}`;
	return cast || place || '';
}

/**
 * Build the "Cast & setting" markdown block. Returns '' when there is nothing
 * to say (no character and no foe), so the caller can prepend unconditionally.
 * Empty background/description/notes lines are omitted.
 */
export function buildStoryPreface(
	character: PrefaceCharacter | null,
	foe: PrefaceFoe | null,
	expedition: PrefaceExpedition | null = null,
): string {
	const blocks: string[] = [];

	if (character && character.name.trim()) {
		const lines = [`**${tidy(character.name)}** — the player character.`];
		if (character.background.trim()) lines.push(tidy(character.background));
		blocks.push(lines.join('\n'));
	}

	if (foe && foe.name.trim()) {
		const meta = [foe.nature.trim(), foe.rank ? `rank ${foe.rank}` : ''].filter(Boolean).join(', ');
		const heading = meta ? `**${tidy(foe.name)}** — ${meta} foe.` : `**${tidy(foe.name)}** — foe.`;
		const lines = [heading];
		if (foe.description.trim()) lines.push(tidy(foe.description));
		if (foe.notes.trim()) lines.push(tidy(foe.notes));
		blocks.push(lines.join('\n'));
	}

	if (expedition && expedition.name.trim()) {
		const kindWord = expedition.kind === 'site' ? 'site' : 'journey';
		const diff = expedition.difficulty.trim();
		const lines = [
			diff
				? `**${tidy(expedition.name)}** — ${diff} ${kindWord}.`
				: `**${tidy(expedition.name)}** — ${kindWord}.`,
		];
		const meta = [
			expedition.theme?.trim() ? `Theme: ${tidy(expedition.theme)}` : '',
			expedition.domain?.trim() ? `Domain: ${tidy(expedition.domain)}` : '',
		].filter(Boolean);
		if (meta.length) lines.push(`${meta.join('. ')}.`);
		if (expedition.objective?.trim()) lines.push(`Objective: ${tidy(expedition.objective)}`);
		if (expedition.notes.trim()) lines.push(tidy(expedition.notes));
		blocks.push(lines.join('\n'));
	}

	if (blocks.length === 0) return '';
	return `# Cast & setting\n\n${blocks.join('\n\n')}`;
}
