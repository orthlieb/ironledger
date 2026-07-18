<script lang="ts">
	/**
	 * LogPanel — displays the reactive session log for a single character.
	 *
	 * Entries are stored in localStorage and rendered newest-first.
	 * Hovering an entry reveals delete and note-edit buttons (opacity 0 → 1).
	 * Notes are attached per-entry and persist to localStorage.
	 * Clearing the log requires confirmation via a native dialog (irreversible).
	 */
	import {
		type LogEntry,
		initLog,
		clearLog,
		deleteLogEntry,
		updateLogEntryNote,
		updateLogEntryHtml,
		enrichOutcomeLinks,
		triggerXpSpend,
		triggerAction,
		appendLog,
		getLog,
		sessionLog,
	} from '$lib/log.svelte.js';
	import { OVERFLOW_RULES, FLOOR_OVERFLOW_RULES } from '$lib/cascadeRules.js';
	import type { DiceCtx } from '$lib/diceContext.svelte.js';
	import { headingText } from '$lib/fontStore.svelte.js';
	import { matchNoteHtml } from '$lib/rollMatch.js';
	import { momentumReset } from '$lib/character.js';
	import { tooltip } from '$lib/actions/tooltip.js';
	import { findMove } from '$lib/moveStore.svelte.js';
	import { renderNote } from '$lib/markdown.js';
	import { parseStorySource } from '$lib/aiSerialize.js';
	import { sanitizeLogHtml, sanitizeNoteHtml } from '$lib/sanitize.js';
	import trashSvg from '$icons/trash-solid-full.svg?raw';
	import penSvg from '$icons/pen-to-square-solid-full.svg?raw';
	import anglesLeftSvg from '$icons/angles-left-solid-full.svg?raw';
	import anglesRightSvg from '$icons/angles-right-solid-full.svg?raw';
	import broomWideSvg from '$icons/broom-wide-solid-full.svg?raw';
	import logIconSvg from '$icons/log.svg?raw';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import StoryDialog from './StoryDialog.svelte';
	import {
		getStartId,
		getEndId,
		hasSection,
		sectionCount,
		isEntryInSection,
		toggleStart,
		toggleEnd,
		clearSection,
	} from '$lib/sectionStore.svelte.js';
	import caretUpSvg from '$icons/caret-large-up-solid.svg?raw';
	import caretDownSvg from '$icons/caret-large-down-solid.svg?raw';

	// ---------------------------------------------------------------------------
	// Callback props for interactive log links (Phase 2)
	// ---------------------------------------------------------------------------
	let {
		ctx = null,
		onMoveLink,
		onOracleLink,
		onProgressLink,
		onInitiativeLink,
		onMenaceLink,
		onVanquishFoe,
		onChangeTheme,
		onChangeDomain,
	}: {
		ctx?: DiceCtx | null;
		onMoveLink?: (moveId: string) => void;
		onOracleLink?: (oracleKey: string, stat?: string) => void;
		onProgressLink?: (track: string, value: number) => void;
		onInitiativeLink?: (value: string, charId: string) => void;
		onMenaceLink?: (value: number) => void;
		onVanquishFoe?: () => void;
		onChangeTheme?: (expeditionId: string) => void;
		onChangeDomain?: (expeditionId: string) => void;
	} = $props();

	// The log is global — no characterId prop needed.
	$effect(() => {
		initLog();
	});

	// Access sessionLog.entries directly so Svelte 5's proxy records a
	// fine-grained dependency on the session log only.
	const entries = $derived(sessionLog.entries);

	// ---------------------------------------------------------------------------
	// Pagination
	// ---------------------------------------------------------------------------
	const PAGE_SIZE = 50;
	let page = $state(0);
	const totalPages = $derived(Math.max(1, Math.ceil(entries.length / PAGE_SIZE)));
	const pagedEntries = $derived(entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));

	/** Scroll container for the log entries — bound to the .log-entries div. */
	let entriesEl = $state<HTMLDivElement | null>(null);

	// Jump to page 0 AND scroll to the top when a new entry is prepended so the
	// user always sees it. Also clamp if the total pages shrink (e.g. after
	// clear or bulk delete).
	let _headEntryId = '';
	$effect(() => {
		const headId = entries[0]?.id ?? '';
		if (headId && headId !== _headEntryId) {
			_headEntryId = headId;
			page = 0;
			// Scroll to top after Svelte renders the new first page.
			queueMicrotask(() => {
				if (entriesEl) entriesEl.scrollTop = 0;
			});
		}
		if (page >= totalPages) page = Math.max(0, totalPages - 1);
	});

	// Per-entry editing state (entry id → draft note text)
	let editingId = $state<string | null>(null);
	let draftNote = $state('');

	// Clear-log confirmation dialog
	let clearDialogRef = $state<{ open(): void; close(): void } | null>(null);

	// Story dialog — single generate view, open() reads the current section
	// from sectionStore. openRegenerate() re-runs an existing Story entry.
	let storyDialogRef = $state<{
		open(): void;
		openRegenerate(entryId: string, source: string): void;
		close(): void;
	} | null>(null);

	const sectionActive = $derived(hasSection());
	const sectionN = $derived(sectionCount());
	const sectionStartId = $derived(getStartId());
	const sectionEndId = $derived(getEndId());

	function openStory() {
		storyDialogRef?.open();
	}

	// Bus listener: /story from the CommandBar opens the generate dialog on
	// the current section. Guarded so it silently no-ops if no start marker
	// is set — the CommandBar already surfaces that as an inline error.
	$effect(() => {
		const onStory = () => {
			if (hasSection()) storyDialogRef?.open();
		};
		document.addEventListener('ironledger:story-generate', onStory);
		return () => document.removeEventListener('ironledger:story-generate', onStory);
	});

	// Mobile tap-tracking — used by touchend delegation to distinguish taps from scrolls.
	let _touchStartX = 0;
	let _touchStartY = 0;

	// ---------------------------------------------------------------------------
	// Burn Momentum
	// ---------------------------------------------------------------------------

	function outcomeClass(hits1: boolean, hits2: boolean): string {
		if (hits1 && hits2) return 'roll-outcome-strong';
		if (hits1 || hits2) return 'roll-outcome-weak';
		return 'roll-outcome-miss';
	}
	function outcomeLabel(hits1: boolean, hits2: boolean): string {
		if (hits1 && hits2) return 'Strong Hit';
		if (hits1 || hits2) return 'Weak Hit';
		return 'Miss';
	}

	function burnMomentum(entry: LogEntry) {
		if (!entry.roll || !ctx) return;
		const { moveId, actionScore, c1, c2, charId } = entry.roll;
		const mom = ctx.data.momentum;
		const resetVal = momentumReset(ctx.data);

		// Determine which dice are cancelled
		const cancel1 = mom > c1;
		const cancel2 = mom > c2;
		const newHits1 = cancel1 ? true : actionScore > c1;
		const newHits2 = cancel2 ? true : actionScore > c2;

		// Build burn notification line
		const cancelled: string[] = [];
		if (cancel1) cancelled.push(`[${c1}]`);
		if (cancel2) cancelled.push(`[${c2}]`);
		const burnLine =
			`<div class="roll-burn">↯ Burned momentum (${mom} → reset ${resetVal}). ` +
			`Challenge ${cancelled.length > 1 ? 'dice' : 'die'} ${cancelled.join(' ')} cancelled.</div>`;

		// New outcome line
		const isMatch = c1 === c2;
		const matchSpan = isMatch ? ' <span class="roll-match">with a match!</span>' : '';
		const newOutcomeLine =
			`<div class="${outcomeClass(newHits1, newHits2)}">` +
			`<strong>${outcomeLabel(newHits1, newHits2)}</strong>${matchSpan}` +
			`</div>` +
			matchNoteHtml(newHits1, newHits2, isMatch);

		// New outcome text from move definition
		const move = findMove(moveId);
		let outcomeTextHtml = '';
		if (move) {
			let raw = '';
			if (newHits1 && newHits2) raw = move.strong ?? '';
			else if (newHits1 || newHits2) raw = move.weak ?? '';
			else raw = move.miss ?? '';
			if (raw) {
				raw = enrichOutcomeLinks(raw, entry.id, charId);
				outcomeTextHtml = `<div class="move-outcome">${raw}</div>`;
			}
		}

		// Rebuild HTML: keep roll-line and roll-cancel, replace everything after
		const existingHtml = entry.html;
		// Find the end of the roll-line div(s) — everything before the outcome class
		const outcomeIdx = existingHtml.search(/<div class="roll-outcome/);
		const prefix = outcomeIdx >= 0 ? existingHtml.substring(0, outcomeIdx) : existingHtml;

		const newHtml = prefix + burnLine + newOutcomeLine + outcomeTextHtml;

		// Update log entry and clear roll meta (prevents double-burn)
		updateLogEntryHtml(entry.id, newHtml, undefined, true);

		// Reset momentum via action bus
		triggerAction({ charId, type: 'resource', key: 'momentum', value: resetVal - mom });
	}

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------

	function startEdit(entry: LogEntry) {
		// Only Note entries are editable — the pen button is gated to them.
		if (entry.title !== 'Note' || entry.source == null) return;
		editingId = entry.id;
		draftNote = entry.source;
	}

	function saveEdit() {
		if (!editingId) return;
		const entry = entries.find((e) => e.id === editingId);
		if (entry?.title === 'Note' && entry.source != null) {
			const text = draftNote.trim();
			if (text) updateLogEntryHtml(editingId, renderNote(text), text);
		}
		editingId = null;
		draftNote = '';
	}

	function cancelEdit() {
		editingId = null;
		draftNote = '';
	}

	function confirmClear() {
		clearLog();
	}

	// ---------------------------------------------------------------------------
	// Markdown export
	// ---------------------------------------------------------------------------

	/**
	 * Convert a single log entry's HTML body to plain markdown text.
	 * Handles <strong>, <em>, <ul>/<li>, <s> and plain text nodes.
	 */
	function htmlToMarkdown(html: string): string {
		if (typeof document === 'undefined') return html;
		const tmp = document.createElement('div');
		tmp.innerHTML = html;
		const lines: string[] = [];

		function walk(node: Node, prefix = '') {
			if (node.nodeType === Node.TEXT_NODE) {
				const t = (node.textContent ?? '').replace(/\n/g, ' ');
				if (t.trim()) lines[lines.length - 1] = (lines[lines.length - 1] ?? '') + t;
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				const el = node as HTMLElement;
				const tag = el.tagName.toLowerCase();

				if (tag === 'ul' || tag === 'ol') {
					el.querySelectorAll('li').forEach((li) => {
						lines.push(`- ${li.textContent?.trim() ?? ''}`);
					});
				} else if (tag === 'li') {
					// handled by parent ul/ol above
				} else if (tag === 'br') {
					lines.push('');
				} else {
					// For block-level elements start a new line; inline elements inline
					const block = ['div', 'p', 'h1', 'h2', 'h3', 'h4'].includes(tag);
					if (block && lines.length > 0) lines.push('');

					// Collect this element's inline markdown
					let inline = '';
					el.childNodes.forEach((child) => {
						if (child.nodeType === Node.TEXT_NODE) {
							inline += child.textContent ?? '';
						} else if (child.nodeType === Node.ELEMENT_NODE) {
							const ct = (child as HTMLElement).tagName.toLowerCase();
							const inner = (child as HTMLElement).textContent ?? '';
							if (ct === 'strong' || ct === 'b') inline += `**${inner}**`;
							else if (ct === 'em' || ct === 'i') inline += `_${inner}_`;
							else if (ct === 's') inline += `~~${inner}~~`;
							else inline += inner;
						}
					});

					const text = inline.trim();
					if (text) lines.push(prefix + text);
				}
			}
		}

		lines.push(''); // seed first line
		tmp.childNodes.forEach((n) => walk(n));
		return lines
			.filter((l, i, a) => !(l === '' && a[i - 1] === ''))
			.join('\n')
			.trim();
	}

	/**
	 * Serialize all current log entries (oldest-first) to a markdown string.
	 * Returns null when the log is empty.
	 */
	function extractLogMarkdown(): string | null {
		if (entries.length === 0) return null;
		const now = new Date();
		const stamp = now.toLocaleString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});

		const lines: string[] = ['# Session Log', `_Exported ${stamp}_`, '', '---', ''];

		// entries are newest-first; export oldest-first
		[...entries].reverse().forEach((entry) => {
			const time = new Date(entry.ts).toLocaleString(undefined, {
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit',
			});
			lines.push(`## ${entry.title}  —  ${time}`);
			lines.push('');
			lines.push(htmlToMarkdown(entry.html));
			if (entry.note?.trim()) {
				lines.push('');
				entry.note.split('\n').forEach((l) => lines.push(`> ${l}`));
			}
			lines.push('');
		});

		return lines.join('\n').trimEnd();
	}

	/** Trigger a browser download of the log as a .md file. */
	export function exportLog() {
		const md = extractLogMarkdown();
		if (!md) return;

		const now = new Date();
		const stamp =
			`${now.getFullYear()}-` +
			String(now.getMonth() + 1).padStart(2, '0') +
			'-' +
			String(now.getDate()).padStart(2, '0') +
			'_' +
			String(now.getHours()).padStart(2, '0') +
			String(now.getMinutes()).padStart(2, '0');
		const filename = `session-log-${stamp}.md`;

		const blob = new Blob([md], { type: 'text/markdown' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	/** Show the clear-log confirmation dialog (exposed for external toolbar). */
	export function showClearDialog() {
		clearDialogRef?.open();
	}

	/** Whether the log has entries (exposed for external toolbar disabled state). */
	export function hasEntries(): boolean {
		return entries.length > 0;
	}

	// ---------------------------------------------------------------------------
	// Strikethrough helper — mark a link as spent by replacing the <a> tag with
	// <s class="resource-spent"> in the stored log entry HTML.
	// ---------------------------------------------------------------------------
	function markLinkSpent(entryId: string, link: HTMLElement): void {
		const entry = sessionLog.entries.find((e) => e.id === entryId);
		if (!entry) return;

		// ⚠  Do NOT use link.outerHTML as the regex pattern.
		//    The browser re-serialises the DOM: \u00a0 → &nbsp;, attribute order
		//    may change, etc.  The stored HTML was built from a template literal and
		//    won't match outerHTML character-for-character.
		//
		//    Instead build the pattern from the element's *-link class and its
		//    data-* attributes using lookaheads, which are attribute-order
		//    independent and never touch text content at all.
		const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

		const linkClass = [...link.classList].find((c) => c.endsWith('-link'));
		if (!linkClass) return;

		// One lookahead per data-* attribute — order independent.
		// Merge link.dataset with entryId (in case DOMPurify stripped data-entry-id
		// from the DOM element; the stored HTML always has it from enrichOutcomeLinks).
		const attrs: Record<string, string> = {};
		for (const [k, v] of Object.entries(link.dataset)) attrs[k] = v ?? '';
		if (!attrs['entryId'] && entryId) attrs['entryId'] = entryId;

		const dataLookaheads = Object.entries(attrs)
			.map(([camel, val]) => {
				const attr = camel.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
				return `(?=[^>]*\\bdata-${esc(attr)}="${esc(val)}")`;
			})
			.join('');

		const re = new RegExp(
			`<a\\b(?=[^>]*\\bclass="${esc(linkClass)}")${dataLookaheads}[^>]*>[\\s\\S]*?<\\/a>`,
		);
		const newHtml = entry.html.replace(re, `<s class="resource-spent">${link.textContent}</s>`);
		updateLogEntryHtml(entryId, newHtml);
	}

	/**
	 * Event-delegation handler for all interactive links in log entry bodies.
	 * Handles XP cost links, resource/debility/progress/initiative/menace links,
	 * and move/oracle reference links.
	 * Accepts both MouseEvent (desktop click) and TouchEvent (mobile touchend).
	 */
	function handleEntriesClick(e: Event) {
		const target = e.target as HTMLElement;

		// ---- XP cost links ----
		const xpLink = target.closest('.xp-cost-link') as HTMLElement | null;
		if (xpLink && !xpLink.classList.contains('xp-spent')) {
			e.preventDefault();
			const cost = parseInt(xpLink.dataset['cost'] ?? '0', 10);
			const entryId =
				xpLink.dataset['entryId'] ??
				xpLink.closest('.log-entry')?.getAttribute('data-entry-id') ??
				'';
			const charId = xpLink.dataset['charId'] ?? ctx?.charId ?? '';
			if (!cost || !entryId || !charId) return;
			const entry = sessionLog.entries.find((ev) => ev.id === entryId);
			if (entry) {
				const newHtml = entry.html.replace(
					/<a\b[^>]*class="xp-cost-link"[^>]*>([^<]*)<\/a>/,
					'<s class="xp-spent">$1</s>',
				);
				updateLogEntryHtml(entryId, newHtml);
			}
			triggerXpSpend(charId, cost);
			return;
		}

		// ---- Resource links ----
		const resLink = target.closest('.resource-link') as HTMLElement | null;
		if (resLink && !resLink.closest('.resource-spent')) {
			e.preventDefault();
			const resource = resLink.dataset['resource'] ?? '';
			const value = parseInt(resLink.dataset['value'] ?? '', 10);
			// data-entry-id / data-char-id may be absent if DOMPurify stripped them;
			// fall back to the parent .log-entry container which is set by Svelte directly.
			const entryId =
				resLink.dataset['entryId'] ??
				resLink.closest('.log-entry')?.getAttribute('data-entry-id') ??
				'';
			const charId = resLink.dataset['charId'] ?? ctx?.charId ?? '';
			if (!resource || Number.isNaN(value) || !value || !charId) return;
			markLinkSpent(entryId, resLink);
			triggerAction({ charId, type: 'resource', key: resource, value });
			// Overflow and floor-overflow cascades.
			if (value < 0 && ctx) {
				const currentVal = (ctx.data as unknown as Record<string, number>)[resource] ?? 0;
				// Overflow: resource drops below 0 — excess converts to another resource.
				const overflowRule = OVERFLOW_RULES.find((r) => r.resource === resource);
				if (overflowRule) {
					const newVal = currentVal + value;
					if (newVal < 0) {
						const overflow = Math.abs(newVal);
						const overflowId = crypto.randomUUID();
						const html = overflowRule.logHtml({ overflow, charId, entryId: overflowId });
						appendLog(overflowRule.logTitle, html, overflowId);
					}
				}
				// Floor overflow: resource already at minimum — trigger cascade move.
				const floorOverflowRule = FLOOR_OVERFLOW_RULES.find(
					(r) => r.resource === resource && currentVal <= r.floor,
				);
				if (floorOverflowRule) {
					const overflow = Math.abs(value);
					const overflowId = crypto.randomUUID();
					const html = floorOverflowRule.logHtml({ overflow, charId, entryId: overflowId });
					appendLog(floorOverflowRule.logTitle, html, overflowId);
				}
			}
			return;
		}

		// ---- Debility links ----
		const debLink = target.closest('.debility-link') as HTMLElement | null;
		if (debLink && !debLink.closest('.resource-spent')) {
			e.preventDefault();
			const debility = debLink.dataset['debility'] ?? '';
			const value = parseInt(debLink.dataset['value'] ?? '1', 10);
			const entryId =
				debLink.dataset['entryId'] ??
				debLink.closest('.log-entry')?.getAttribute('data-entry-id') ??
				'';
			const charId = debLink.dataset['charId'] ?? ctx?.charId ?? '';
			if (!debility || !charId) return;
			if (entryId) markLinkSpent(entryId, debLink);
			triggerAction({ charId, type: 'debility', key: debility, value });
			return;
		}

		// ---- Failure links ----
		const failureLink = target.closest('.failure-link') as HTMLElement | null;
		if (failureLink && !failureLink.closest('.resource-spent')) {
			e.preventDefault();
			const entryId =
				failureLink.dataset['entryId'] ??
				failureLink.closest('.log-entry')?.getAttribute('data-entry-id') ??
				'';
			const charId = failureLink.dataset['charId'] ?? ctx?.charId ?? '';
			if (!entryId || !charId) return;
			markLinkSpent(entryId, failureLink);
			triggerAction({ charId, type: 'resource', key: 'failures', value: 1 });
			return;
		}

		// ---- Burn momentum links ----
		const burnLink = target.closest('.burn-momentum-link') as HTMLElement | null;
		if (burnLink && !burnLink.closest('.resource-spent')) {
			e.preventDefault();
			const rollEntryId = burnLink.dataset['rollEntryId'] ?? '';
			const burnEntryId =
				burnLink.dataset['entryId'] ??
				burnLink.closest('.log-entry')?.getAttribute('data-entry-id') ??
				'';
			const charId = burnLink.dataset['charId'] ?? ctx?.charId ?? '';
			if (!rollEntryId || !burnEntryId || !charId) return;
			if (!ctx || ctx.charId !== charId || ctx.data.momentum <= 0) return;
			const rollEntry = getLog().find((e) => e.id === rollEntryId);
			if (!rollEntry) return;
			markLinkSpent(burnEntryId, burnLink);
			burnMomentum(rollEntry);
			return;
		}

		// ---- Move links ----
		const moveLink = target.closest('.move-link') as HTMLElement | null;
		if (moveLink) {
			e.preventDefault();
			const moveId = moveLink.dataset['id'] ?? '';
			if (!moveId) return;
			// Special case: "Ask the Oracle" move opens oracles dialog
			if (moveId === 'move/ask-the-oracle') {
				onOracleLink?.('');
			} else {
				onMoveLink?.(moveId);
			}
			return;
		}

		// ---- Oracle links ----
		const oracleLink = target.closest('.oracle-link') as HTMLElement | null;
		if (oracleLink) {
			e.preventDefault();
			const oracleKey = oracleLink.dataset['oracle'] ?? '';
			const oracleStat = oracleLink.dataset['stat'];
			onOracleLink?.(oracleKey, oracleStat);
			return;
		}

		// ---- Progress links ----
		const progLink = target.closest('.progress-link') as HTMLElement | null;
		if (progLink && !progLink.closest('.resource-spent')) {
			e.preventDefault();
			const track = progLink.dataset['track'] ?? '';
			const value = parseInt(progLink.dataset['value'] ?? '1', 10);
			const entryId =
				progLink.dataset['entryId'] ??
				progLink.closest('.log-entry')?.getAttribute('data-entry-id') ??
				'';
			if (!track || !value) return;
			if (entryId) markLinkSpent(entryId, progLink);
			onProgressLink?.(track, value);
			return;
		}

		// ---- Initiative links ----
		const initLink = target.closest('.initiative-link') as HTMLElement | null;
		if (initLink && !initLink.closest('.resource-spent')) {
			e.preventDefault();
			const value = initLink.dataset['value'] ?? '';
			const charId = initLink.dataset['charId'] ?? ctx?.charId ?? '';
			// data-entry-id may be absent if DOMPurify stripped it; fall back to
			// the parent .log-entry container which is set by Svelte directly.
			const entryId =
				initLink.dataset['entryId'] ??
				initLink.closest('.log-entry')?.getAttribute('data-entry-id') ??
				'';
			if (!value) return;
			if (entryId) markLinkSpent(entryId, initLink);
			onInitiativeLink?.(value, charId);
			return;
		}

		// ---- Menace links ----
		const menaceLink = target.closest('.menace-link') as HTMLElement | null;
		if (menaceLink && !menaceLink.closest('.resource-spent')) {
			e.preventDefault();
			const value = parseInt(menaceLink.dataset['value'] ?? '1', 10);
			const entryId =
				menaceLink.dataset['entryId'] ??
				menaceLink.closest('.log-entry')?.getAttribute('data-entry-id') ??
				'';
			if (!value) return;
			if (entryId) markLinkSpent(entryId, menaceLink);
			onMenaceLink?.(value);
			return;
		}

		// ---- Vanquish foe links ----
		const vanquishLink = target.closest('.vanquish-foe-link') as HTMLElement | null;
		if (vanquishLink && !vanquishLink.closest('.resource-spent')) {
			e.preventDefault();
			const entryId =
				vanquishLink.dataset['entryId'] ??
				vanquishLink.closest('.log-entry')?.getAttribute('data-entry-id') ??
				'';
			if (entryId) markLinkSpent(entryId, vanquishLink);
			onVanquishFoe?.();
			return;
		}

		// ---- Reset track links (e.g. "clear all progress" on failure track) ----
		const resetLink = target.closest('.reset-track-link') as HTMLElement | null;
		if (resetLink && !resetLink.closest('.resource-spent')) {
			e.preventDefault();
			const track = resetLink.dataset['track'] ?? '';
			const entryId =
				resetLink.dataset['entryId'] ??
				resetLink.closest('.log-entry')?.getAttribute('data-entry-id') ??
				'';
			const charId = resetLink.dataset['charId'] ?? ctx?.charId ?? '';
			if (!track || !charId) return;
			if (entryId) markLinkSpent(entryId, resetLink);
			triggerAction({ charId, type: 'reset-track', key: track, value: 0 });
			return;
		}

		// ---- Change theme links ----
		const changeThemeLink = target.closest('.change-theme-link') as HTMLElement | null;
		if (changeThemeLink && !changeThemeLink.closest('.resource-spent')) {
			e.preventDefault();
			const expId = changeThemeLink.dataset['expeditionId'] ?? '';
			const entryId = changeThemeLink.closest('.log-entry')?.getAttribute('data-entry-id') ?? '';
			if (!expId) return;
			if (entryId) markLinkSpent(entryId, changeThemeLink);
			onChangeTheme?.(expId);
			return;
		}

		// ---- Change domain links ----
		const changeDomainLink = target.closest('.change-domain-link') as HTMLElement | null;
		if (changeDomainLink && !changeDomainLink.closest('.resource-spent')) {
			e.preventDefault();
			const expId = changeDomainLink.dataset['expeditionId'] ?? '';
			const entryId = changeDomainLink.closest('.log-entry')?.getAttribute('data-entry-id') ?? '';
			if (!expId) return;
			if (entryId) markLinkSpent(entryId, changeDomainLink);
			onChangeDomain?.(expId);
			return;
		}
	}

	/** Selector covering all interactive link classes — used for touchend fast-tap. */
	const LINK_SELECTOR = [
		'.resource-link',
		'.move-link',
		'.oracle-link',
		'.initiative-link',
		'.progress-link',
		'.debility-link',
		'.menace-link',
		'.vanquish-foe-link',
		'.burn-momentum-link',
		'.xp-cost-link',
		'.failure-link',
		'.reset-track-link',
		'.change-theme-link',
		'.change-domain-link',
	].join(', ');

	function handleEntriesTouchStart(e: TouchEvent) {
		_touchStartX = e.touches[0].clientX;
		_touchStartY = e.touches[0].clientY;
	}

	/**
	 * Mobile fast-tap: fire the link handler immediately on touchend if the finger
	 * didn't travel more than 10px (i.e. it's a tap, not a scroll).  This bypasses
	 * the browser's ~300 ms synthetic-click delay for interactive log links.
	 */
	function handleEntriesTouchEnd(e: TouchEvent) {
		const touch = e.changedTouches[0];
		const dx = Math.abs(touch.clientX - _touchStartX);
		const dy = Math.abs(touch.clientY - _touchStartY);
		if (dx > 10 || dy > 10) return; // scroll gesture — let the browser handle it
		const target = e.target as HTMLElement;
		if (!target.closest(LINK_SELECTOR)) return; // not a link tap
		// Prevent the browser from also firing a synthetic click (~300 ms later).
		e.preventDefault();
		handleEntriesClick(e);
	}
</script>

<div class="log-panel">
	<!-- ── Built-in header: title · pagination · clear ── -->
	<div class="log-header">
		<span class="log-title-icon" aria-hidden="true">{@html logIconSvg}</span>
		<span class="log-title">{headingText('Log')}</span>

		<div class="log-pagination">
			<button
				class="pag-btn"
				onclick={() => page--}
				disabled={page === 0}
				use:tooltip={'Previous page'}
				aria-label="Previous page">{@html anglesLeftSvg}</button
			>
			<span class="pag-label">pg {page + 1}/{totalPages}</span>
			<button
				class="pag-btn"
				onclick={() => page++}
				disabled={page === totalPages - 1}
				use:tooltip={'Next page'}
				aria-label="Next page">{@html anglesRightSvg}</button
			>
		</div>

		<div class="log-header-actions">
			<button
				class="btn story-btn"
				class:story-btn-active={sectionActive}
				onclick={openStory}
				disabled={!sectionActive}
				use:tooltip={sectionActive
					? sectionEndId === null
						? `Generate story (${sectionN} ${sectionN === 1 ? 'entry' : 'entries'}, open selection)`
						: `Generate story (${sectionN} ${sectionN === 1 ? 'entry' : 'entries'} selected)`
					: 'Mark a start (▲) on a log entry to begin a story selection'}
				aria-label={sectionActive ? 'Generate story from selection' : 'Generate story'}
			>
				<span class="story-btn-label">{sectionActive ? `Generate (${sectionN})` : 'Story'}</span>
			</button>
			<button
				class="btn icon-btn log-clear-btn"
				onclick={() => clearDialogRef?.open()}
				use:tooltip={'Clear the log'}
				aria-label="Clear the log"
				disabled={entries.length === 0}>{@html broomWideSvg}</button
			>
		</div>
	</div>

	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="log-entries"
		role="log"
		aria-live="polite"
		aria-label="Session log"
		bind:this={entriesEl}
		tabindex="-1"
		onclick={handleEntriesClick}
		ontouchstart={handleEntriesTouchStart}
		ontouchend={handleEntriesTouchEnd}
	>
		{#if entries.length === 0}
			<div class="log-empty">
				<span class="log-empty-icon" aria-hidden="true">{@html logIconSvg}</span>
				<span>No entries yet. History waits patiently.<br />It will not wait forever.</span>
			</div>
		{:else}
			{#each pagedEntries as entry (entry.id)}
				<div
					class="log-entry"
					class:log-entry-in-section={isEntryInSection(entry.id)}
					class:log-entry-section-start={entry.id === sectionStartId}
					class:log-entry-section-end={entry.id === sectionEndId}
					data-entry-id={entry.id}
				>
					<!-- Header row: title, time, and hover-reveal action buttons -->
					<div class="entry-header">
						<span class="entry-title">{entry.title}</span>

						<!-- Action buttons — opacity 0, revealed on .log-entry:hover -->
						<div class="entry-actions">
							<button
								class="entry-btn entry-marker-btn"
								class:entry-btn-active={entry.id === sectionStartId}
								onclick={() => toggleStart(entry.id)}
								use:tooltip={entry.id === sectionStartId
									? 'Clear start marker'
									: 'Mark as section start (oldest included entry)'}
								aria-label={entry.id === sectionStartId
									? 'Clear start marker'
									: 'Mark as section start'}
								aria-pressed={entry.id === sectionStartId}>{@html caretUpSvg}</button
							>
							<button
								class="entry-btn entry-marker-btn"
								class:entry-btn-active={entry.id === sectionEndId}
								onclick={() => toggleEnd(entry.id)}
								disabled={sectionStartId === null || entry.id === sectionStartId}
								use:tooltip={sectionStartId === null
									? 'Mark a start (▲) first'
									: entry.id === sectionEndId
										? 'Clear end marker (section becomes open-ended)'
										: 'Mark as section end (newest included entry)'}
								aria-label={entry.id === sectionEndId ? 'Clear end marker' : 'Mark as section end'}
								aria-pressed={entry.id === sectionEndId}>{@html caretDownSvg}</button
							>
							{#if parseStorySource(entry.source)}
								<button
									class="entry-btn entry-regen-btn"
									onclick={() => storyDialogRef?.openRegenerate(entry.id, entry.source ?? '')}
									use:tooltip={'Regenerate this story'}
									aria-label="Regenerate this story">⟳</button
								>
							{/if}
							{#if entry.title === 'Note'}
								<button
									class="entry-btn entry-edit-btn"
									class:entry-btn-active={editingId === entry.id}
									onclick={() => (editingId === entry.id ? cancelEdit() : startEdit(entry))}
									use:tooltip={editingId === entry.id ? 'Cancel edit' : 'Edit note'}
									aria-label="Edit this note">{@html penSvg}</button
								>
							{/if}

							<button
								class="entry-btn entry-delete-btn"
								onclick={() => {
									if (editingId === entry.id) cancelEdit();
									deleteLogEntry(entry.id);
								}}
								use:tooltip={'Delete this log entry'}
								aria-label="Delete log entry">{@html trashSvg}</button
							>
						</div>
					</div>

					<!-- Entry body — hidden when editing a Note (textarea replaces it) -->
					{#if !(editingId === entry.id && entry.title === 'Note')}
						<div class="entry-body">{@html sanitizeLogHtml(entry.html)}</div>
					{/if}

					<!-- Inline editor (Note entries only). -->
					{#if editingId === entry.id && entry.title === 'Note'}
						<div class="entry-edit">
							<textarea
								class="note-input"
								rows="6"
								placeholder="Edit your note…"
								bind:value={draftNote}
								onkeydown={(e) => {
									if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveEdit();
									if (e.key === 'Escape') cancelEdit();
								}}
							></textarea>
							<div class="note-edit-actions">
								<button class="btn btn-sm" onclick={cancelEdit}>Cancel</button>
								<button class="btn btn-sm btn-primary" onclick={saveEdit}>Save</button>
							</div>
						</div>
					{:else if entry.note}
						<!-- Legacy sub-note (persisted before add-note-to-move was removed).
						     Still rendered so the history isn't lost; the entry can be deleted
						     via the trash button to remove it. -->
						<div class="entry-note">{@html sanitizeNoteHtml(renderNote(entry.note))}</div>
					{/if}
				</div>
			{/each}
		{/if}
	</div>

	{#if sectionActive}
		<div class="section-strip" role="status" aria-live="polite">
			<span class="section-strip-count">
				<span class="section-strip-icon" aria-hidden="true">{@html caretUpSvg}</span>
				<strong>{sectionN}</strong>
				{sectionN === 1 ? 'entry' : 'entries'}
				{sectionEndId === null ? '· growing' : ''}
			</span>
			<div class="section-strip-actions">
				<button
					class="btn btn-sm section-strip-generate"
					onclick={openStory}
					use:tooltip={'Generate a story from the selected section'}>Generate</button
				>
				<button class="btn btn-sm" onclick={clearSection} use:tooltip={'Clear both section markers'}
					>Clear</button
				>
			</div>
		</div>
	{/if}
</div>

<!-- Story recording + generation dialog -->
<StoryDialog bind:this={storyDialogRef} />

<!-- Clear-log confirmation dialog -->
<ConfirmDialog
	bind:this={clearDialogRef}
	title="Clear Session Log?"
	onconfirm={confirmClear}
	confirmLabel="Clear Log"
>
	<p
		style="font-family: var(--font-ui); font-size: 0.82rem; color: var(--text-muted); margin: 0; line-height: 1.5;"
	>
		This will permanently remove all {entries.length}
		{entries.length === 1 ? 'entry' : 'entries'}. This cannot be undone.
	</p>
</ConfirmDialog>

<style>
	.log-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: transparent;
	}

	/* ── Built-in log header ── */
	.log-header {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: var(--area-header-height);
		padding: 6px 12px;
		background: var(--bg-control);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.log-title-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		color: var(--text-accent);
	}
	.log-title-icon :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}

	.log-title {
		font-family: var(--font-display, 'Cinzel', serif);
		font-size: calc(0.82rem * var(--font-display-scale));
		font-weight: 700;
		font-variant: var(--font-display-variant);
		letter-spacing: 0.08em;
		color: var(--text-accent);
		text-transform: var(--font-display-transform);
		flex: 1;
		min-width: 0;
	}

	/* ── Pagination controls ── */
	.log-pagination {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}

	.pag-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		padding: 0;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 3px;
		cursor: pointer;
		color: var(--text-muted);
		transition:
			color 0.12s,
			border-color 0.12s;
	}
	.pag-btn:hover:not(:disabled) {
		color: var(--text);
		border-color: var(--border-mid);
	}
	.pag-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}
	.pag-btn :global(svg) {
		width: 10px;
		height: 10px;
		fill: currentColor;
	}

	.pag-label {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-muted);
		white-space: nowrap;
		min-width: 42px;
		text-align: center;
	}

	.log-header-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}
	/* ── Story generate button ──
	   Idle (no selection): dimmed chip. Active (section pinned): accent-tinted. */
	.story-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 3px 8px;
		height: 22px;
		background: transparent;
		border: 1px solid var(--border-mid);
		border-radius: 3px;
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-muted);
		cursor: pointer;
		transition:
			color 0.12s,
			border-color 0.12s,
			background 0.12s;
	}
	.story-btn:hover:not(:disabled) {
		color: var(--text);
		border-color: var(--text-accent);
	}
	.story-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.story-btn-active {
		color: var(--text-accent);
		border-color: var(--text-accent);
		background: color-mix(in srgb, var(--text-accent) 12%, transparent);
	}

	/* Icon-only "Clear the log" button — square, matches the stage-header
	   delete buttons (28×22). pointer-events:none on the SVG so the tooltip
	   surfaces over the broom icon. fill: currentColor so the icon picks up
	   the button's text color in both light and dark themes. */
	.log-clear-btn {
		box-sizing: border-box;
		width: 28px;
		height: 22px;
		min-width: 28px;
		padding: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.log-clear-btn :global(svg) {
		width: 14px;
		height: 14px;
		fill: currentColor;
		pointer-events: none;
	}
	.log-clear-btn :global(svg) :global(path) {
		fill: currentColor;
	}

	/* icon-btn is defined in page.svelte's scoped styles, so we redefine
	   SVG sizing here for the Clear button that lives inside LogPanel. */
	.icon-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.icon-btn :global(svg) {
		width: 13px;
		height: 13px;
		fill: currentColor;
		flex-shrink: 0;
	}

	.log-entries {
		flex: 1;
		overflow-y: auto;
		/* Plain 8px on all sides. iOS Safari (browser mode) reports
		   env(safe-area-inset-bottom) as 0 because its tab bar already
		   reserves the home-indicator zone, and in PWA mode the design
		   rule is the log surface reaches the viewport edge. */
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.log-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1.5rem;
		text-align: center;
		gap: 8px;
		color: var(--text-muted);
		font-family: var(--font-ui);
		font-size: 0.8rem;
	}

	.log-empty-icon {
		display: flex;
		width: 48px;
		height: 48px;
		opacity: 0.25;
		margin-bottom: 4px;
	}
	.log-empty-icon :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}

	/* ---- Log entry ---- */
	.log-entry {
		padding: 6px 9px;
		position: relative;
		border-bottom: 1px solid var(--border);
	}
	.log-entry:last-child {
		border-bottom: none;
	}

	.log-entry:last-child {
		border-bottom: none;
	}

	.entry-header {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 3px;
	}

	.entry-title {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-accent);
		white-space: nowrap;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* ---- Hover-reveal action buttons ---- */
	.entry-actions {
		display: flex;
		gap: 3px;
		flex-shrink: 0;
	}

	.entry-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2px 4px;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 3px;
		cursor: pointer;
		/* Hidden by default — revealed on .log-entry:hover */
		opacity: 0;
		transition:
			opacity 0.15s,
			color 0.12s,
			border-color 0.12s;
	}

	/* Reveal buttons when hovering the entry */
	.log-entry:hover .entry-btn {
		opacity: 1;
	}

	.entry-btn :global(svg) {
		width: 10px;
		height: 10px;
		fill: currentColor;
	}

	.entry-edit-btn {
		color: var(--text-dimmer);
	}
	.entry-edit-btn:hover,
	.entry-btn-active {
		color: var(--text-accent);
		border-color: var(--text-accent);
		opacity: 1 !important;
	}

	/* Story regenerate — ⟳ glyph, sized to match the 10px SVG icon buttons */
	.entry-regen-btn {
		color: var(--text-dimmer);
		font-size: 11px;
		line-height: 1;
		font-weight: 700;
	}
	.entry-regen-btn:hover {
		color: var(--text-accent);
		border-color: var(--text-accent);
	}

	/* Section marker buttons (▲ start, ▼ end). Active state is styled by
	   the shared .entry-btn-active rule below. */
	.entry-marker-btn {
		color: var(--text-dimmer);
	}
	.entry-marker-btn:hover:not(:disabled) {
		color: var(--text-accent);
		border-color: var(--text-accent);
	}
	.entry-marker-btn:disabled {
		opacity: 0.25;
		cursor: default;
	}
	/* Keep marker buttons visible when they're the active start/end even if
	   the row isn't hovered — otherwise it's easy to forget where the
	   markers are pinned. */
	.log-entry .entry-marker-btn.entry-btn-active {
		opacity: 1;
	}

	.entry-delete-btn {
		color: var(--text-dimmer);
	}
	/* Match the rest of the trashcan family: only the icon colour turns red
	   on hover; the border keeps its default tone, matching .btn-trash. */
	.entry-delete-btn:hover {
		color: var(--color-danger);
	}

	/* ---- Entry body ---- */
	.entry-body {
		font-family: var(--font-ui);
		font-size: 0.82rem;
		color: var(--text-muted);
		line-height: 1.4;
	}

	.entry-body :global(.dialog-only) {
		display: none;
	}
	.entry-body :global(strong) {
		color: var(--text);
		font-weight: 600;
	}

	.entry-body :global(div) {
		margin-bottom: 1px;
	}

	/* Feature lists (e.g. yrtTouched) */
	.entry-body :global(ul),
	.entry-body :global(ol) {
		margin: 2px 0 3px;
		padding-left: 1.3em;
	}
	.entry-body :global(li) {
		margin-bottom: 1px;
	}

	/* Dice roll lines use monospace font */
	.entry-body :global(.roll-line),
	.entry-body :global(.roll-cancel),
	.entry-body :global(.roll-outcome-strong),
	.entry-body :global(.roll-outcome-weak),
	.entry-body :global(.roll-outcome-miss) {
		font-family: var(--font-mono, 'Roboto Mono', ui-monospace, monospace);
	}

	/* Roll outcome colours. Also target <strong> inside each div because
	   .entry-body :global(strong) { color: var(--text) } would otherwise win */
	.entry-body :global(.roll-outcome-strong),
	.entry-body :global(.roll-outcome-strong strong) {
		color: var(--color-success, #34d399);
		font-weight: 700;
	}
	.entry-body :global(.roll-outcome-weak),
	.entry-body :global(.roll-outcome-weak strong) {
		color: var(--color-momentum, #60a5fa);
		font-weight: 700;
	}
	.entry-body :global(.roll-outcome-miss),
	.entry-body :global(.roll-outcome-miss strong) {
		color: var(--color-danger, #ef4444);
		font-weight: 700;
	}
	.entry-body :global(.roll-match) {
		font-weight: 400;
		font-style: italic;
	}
	.entry-body :global(.roll-cancel) {
		color: var(--color-danger, #ef4444);
		font-size: 0.75rem;
	}
	.entry-body :global(.roll-burn) {
		color: var(--color-momentum, #60a5fa);
		font-size: 0.75rem;
		font-weight: 600;
	}

	/* Move outcome text (embedded in log entries from moves) */
	.entry-body :global(.move-outcome) {
		margin-top: 4px;
		padding: 4px 8px;
		border-left: 2px solid var(--border-mid);
		background: color-mix(in srgb, var(--bg-inset) 60%, transparent);
		border-radius: 0 3px 3px 0;
		font-size: 0.78rem;
		line-height: 1.5;
		color: var(--text-muted);
	}
	/* Outcome border colour matches the result */
	.entry-body :global(.roll-outcome-strong + .move-outcome) {
		border-left-color: var(--color-success, #34d399);
	}
	.entry-body :global(.roll-outcome-weak + .move-outcome) {
		border-left-color: var(--color-momentum, #60a5fa);
	}
	.entry-body :global(.roll-outcome-miss + .move-outcome) {
		border-left-color: var(--color-danger, #ef4444);
	}
	.entry-body :global(.move-outcome strong) {
		color: var(--text);
		font-weight: 600;
	}
	.entry-body :global(.move-outcome ul) {
		margin: 3px 0;
		padding-left: 1.3em;
	}
	.entry-body :global(.move-outcome li) {
		margin-bottom: 2px;
	}

	/* Failure link row (appended after miss outcomes) */
	.entry-body :global(.move-failure-row) {
		margin-top: 5px;
	}
	.entry-body :global(.failure-link) {
		color: var(--color-danger, #ef4444);
		text-decoration: underline;
		cursor: pointer;
		font-size: 0.78rem;
		font-weight: 600;
		touch-action: manipulation;
	}
	.entry-body :global(.failure-link:hover) {
		opacity: 0.8;
	}

	/* Interactive links in move outcomes */
	.entry-body :global(.resource-link),
	.entry-body :global(.move-link),
	.entry-body :global(.oracle-link),
	.entry-body :global(.initiative-link),
	.entry-body :global(.progress-link),
	.entry-body :global(.debility-link),
	.entry-body :global(.menace-link),
	.entry-body :global(.vanquish-foe-link),
	.entry-body :global(.burn-momentum-link),
	.entry-body :global(.reset-track-link) {
		color: var(--text-accent);
		text-decoration: underline;
		cursor: pointer;
		/* Removes 300 ms tap delay on mobile — browser won't wait for double-tap-to-zoom. */
		touch-action: manipulation;
	}
	.entry-body :global(.resource-link:hover),
	.entry-body :global(.move-link:hover),
	.entry-body :global(.oracle-link:hover),
	.entry-body :global(.initiative-link:hover),
	.entry-body :global(.progress-link:hover),
	.entry-body :global(.debility-link:hover),
	.entry-body :global(.menace-link:hover),
	.entry-body :global(.vanquish-foe-link:hover),
	.entry-body :global(.burn-momentum-link:hover),
	.entry-body :global(.reset-track-link:hover) {
		opacity: 0.8;
	}
	.entry-body :global(.resource-spent) {
		text-decoration: line-through;
		color: var(--text-dimmer);
		cursor: default;
	}

	/* Harm placeholder: no foe context — player resolves manually */
	.entry-body :global(.harm-note) {
		font-style: italic;
		color: var(--text-dimmer);
	}

	/* XP cost links (clickable, strike-through after use) */
	.entry-body :global(.xp-cost-link) {
		color: var(--text-accent);
		text-decoration: underline;
		font-weight: 600;
		cursor: pointer;
		touch-action: manipulation;
	}
	.entry-body :global(.xp-cost-link):hover {
		opacity: 0.8;
	}
	.entry-body :global(.xp-spent) {
		text-decoration: line-through;
		color: var(--text-dimmer);
		font-weight: normal;
	}

	/* ---- Inline note editor ---- */
	.entry-edit {
		margin-top: 5px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.note-input {
		width: 100%;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		resize: vertical;
		padding: 4px 7px;
		min-height: 48px;
		border-color: var(--border-mid);
	}

	.note-edit-actions {
		display: flex;
		gap: 4px;
		justify-content: flex-end;
	}

	.btn-sm {
		padding: 2px 8px;
		font-size: 0.68rem;
	}

	.btn-primary {
		background: var(--text-accent);
		border-color: var(--text-accent);
		color: var(--bg-card);
		font-weight: 600;
	}
	.btn-primary:hover {
		opacity: 0.88;
	}

	/* ---- Saved note display (markdown-rendered) ---- */
	.entry-note {
		margin-top: 5px;
		padding: 4px 7px;
		border-left: 2px solid var(--border-mid);
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text-muted);
		line-height: 1.5;
	}

	/* Markdown elements rendered inside .entry-note */
	.entry-note :global(p) {
		margin: 0 0 3px;
		font-style: italic;
	}
	.entry-note :global(h3),
	.entry-note :global(h4),
	.entry-note :global(h5) {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-accent);
		margin: 5px 0 2px;
		font-style: normal;
	}
	.entry-note :global(ul),
	.entry-note :global(ol) {
		margin: 2px 0 4px;
		padding-left: 1.3em;
		font-style: italic;
	}
	.entry-note :global(li) {
		margin-bottom: 1px;
	}
	.entry-note :global(strong) {
		font-weight: 700;
		color: var(--text);
		font-style: normal;
	}
	.entry-note :global(em) {
		font-style: italic;
	}
	.entry-note :global(br) {
		display: block;
		margin-bottom: 4px;
		content: '';
	}

	/* ── Section highlighting ── */
	.log-entry-in-section {
		background: color-mix(in srgb, var(--text-accent) 6%, transparent);
		box-shadow: inset 3px 0 0 0 var(--text-accent);
	}
	.log-entry-in-section.log-entry-section-start,
	.log-entry-in-section.log-entry-section-end {
		background: color-mix(in srgb, var(--text-accent) 12%, transparent);
	}

	/* ── Floating section strip ── */
	.section-strip {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 6px 12px;
		background: color-mix(in srgb, var(--text-accent) 8%, var(--bg-control));
		border-top: 1px solid var(--text-accent);
		flex-shrink: 0;
		font-family: var(--font-ui);
		font-size: 0.72rem;
		color: var(--text);
	}
	.section-strip-count {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		color: var(--text-muted);
	}
	.section-strip-count strong {
		color: var(--text);
		font-weight: 700;
	}
	.section-strip-icon {
		display: inline-flex;
		width: 10px;
		height: 10px;
		color: var(--text-accent);
	}
	.section-strip-icon :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
	.section-strip-actions {
		display: flex;
		gap: 4px;
	}
	.section-strip-generate {
		background: var(--text-accent);
		border-color: var(--text-accent);
		color: var(--bg-card);
		font-weight: 600;
	}
	.section-strip-generate:hover {
		opacity: 0.88;
	}

	/* ── Mobile: hide the whole story-selection surface.
	   The AI story flow is a desktop-only convenience — the ▲/▼ marker
	   buttons are hover-revealed and awkward to hit on touch, and the
	   Generate/floating-strip UI eats scarce mobile chrome (Adventure
	   split defaults the log to just 20% of the viewport). Uses the
	   canonical mobile breakpoint documented in mobile.md. The underlying
	   sectionStore state still works, so a section pinned on desktop is
	   still highlighted here (read-only) but can't be mutated. ── */
	@media (max-width: 767px) {
		.story-btn,
		.entry-marker-btn,
		.section-strip {
			display: none !important;
		}
	}
</style>
