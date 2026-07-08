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
