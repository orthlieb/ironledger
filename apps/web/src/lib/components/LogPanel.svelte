<script lang="ts">
	/**
	 * LogPanel — displays the reactive session log for a single character.
	 *
	 * Entries are stored in localStorage and rendered newest-first.
	 * Hovering an entry reveals delete and note-edit buttons (opacity 0 → 1).
	 * Notes are attached per-entry and persist to localStorage.
	 * Clearing the log requires confirmation via a native dialog (irreversible).
	 */
	import { type LogEntry, logs, initLog, clearLog, deleteLogEntry, updateLogEntryNote, updateLogEntryHtml, enrichOutcomeLinks, triggerXpSpend, triggerAction, appendLog, getLog, SESSION_LOG_ID } from '$lib/log.svelte.js';
	import { OVERFLOW_RULES, FLOOR_OVERFLOW_RULES, BURN_MOMENTUM_TITLE } from '$lib/cascadeRules.js';
	import type { DiceCtx } from '$lib/diceContext.svelte.js';
	import { momentumReset } from '$lib/character.js';
	import { findMove } from '$lib/moveStore.svelte.js';
	import { renderNote } from '$lib/markdown.js';
	import trashSvg      from '$icons/trash-solid-full.svg?raw';
	import penSvg        from '$icons/pen-to-square-solid-full.svg?raw';
	import fileExportSvg from '$icons/file-export-solid-full.svg?raw';
	import ConfirmDialog from './ConfirmDialog.svelte';

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
	}: {
		ctx?:              DiceCtx | null;
		onMoveLink?:       (moveId: string) => void;
		onOracleLink?:     (oracleKey: string) => void;
		onProgressLink?:   (track: string, value: number) => void;
		onInitiativeLink?: (value: string) => void;
		onMenaceLink?:     (value: number) => void;
		onVanquishFoe?:    () => void;
	} = $props();

	// The log is global — no characterId prop needed.
	$effect(() => {
		initLog(SESSION_LOG_ID);
	});

	// Access logs[SESSION_LOG_ID] directly so Svelte 5's proxy records a
	// fine-grained dependency on the session log only.
	const entries = $derived(logs[SESSION_LOG_ID] ?? []);

	// Per-entry editing state (entry id → draft note text)
	let editingId   = $state<string | null>(null);
	let draftNote   = $state('');

	// Clear-log confirmation dialog
	let clearDialogRef = $state<{ open(): void; close(): void } | null>(null);

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
			`</div>`;

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
		updateLogEntryHtml(SESSION_LOG_ID, entry.id, newHtml, undefined, true);

		// Reset momentum via action bus
		triggerAction({ charId, type: 'resource', key: 'momentum', value: resetVal - mom });
	}

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------

	function startEdit(entry: LogEntry) {
		editingId = entry.id;
		// For Note entries, edit the main content source; for others, edit the sub-note
		if (entry.title === 'Note' && entry.source != null) {
			draftNote = entry.source;
		} else {
			draftNote = entry.note ?? '';
		}
	}

	function saveEdit() {
		if (!editingId) return;
		const entry = entries.find((e) => e.id === editingId);
		if (entry?.title === 'Note' && entry.source != null) {
			// Update the main content from markdown source
			const text = draftNote.trim();
			if (text) {
				updateLogEntryHtml(SESSION_LOG_ID, editingId, renderNote(text), text);
			}
		} else {
			updateLogEntryNote(SESSION_LOG_ID, editingId, draftNote);
		}
		editingId = null;
		draftNote = '';
	}

	function cancelEdit() {
		editingId = null;
		draftNote = '';
	}

	function confirmClear() {
		clearLog(SESSION_LOG_ID);
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
				const el  = node as HTMLElement;
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
							else if (ct === 's')               inline += `~~${inner}~~`;
							else                               inline += inner;
						}
					});

					const text = inline.trim();
					if (text) lines.push(prefix + text);
				}
			}
		}

		lines.push('');            // seed first line
		tmp.childNodes.forEach((n) => walk(n));
		return lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim();
	}

	/**
	 * Serialize all current log entries (oldest-first) to a markdown string.
	 * Returns null when the log is empty.
	 */
	function extractLogMarkdown(): string | null {
		if (entries.length === 0) return null;
		const now = new Date();
		const stamp = now.toLocaleString(undefined, {
			year: 'numeric', month: 'short', day: 'numeric',
			hour: '2-digit', minute: '2-digit',
		});

		const lines: string[] = [
			'# Session Log',
			`_Exported ${stamp}_`,
			'',
			'---',
			'',
		];

		// entries are newest-first; export oldest-first
		[...entries].reverse().forEach((entry) => {
			const time = new Date(entry.ts).toLocaleString(undefined, {
				month: 'short', day: 'numeric',
				hour: '2-digit', minute: '2-digit',
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

		const now    = new Date();
		const stamp  = `${now.getFullYear()}-`
			+ String(now.getMonth() + 1).padStart(2, '0') + '-'
			+ String(now.getDate()).padStart(2, '0') + '_'
			+ String(now.getHours()).padStart(2, '0')
			+ String(now.getMinutes()).padStart(2, '0');
		const filename = `session-log-${stamp}.md`;

		const blob = new Blob([md], { type: 'text/markdown' });
		const url  = URL.createObjectURL(blob);
		const a    = document.createElement('a');
		a.href     = url;
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
		const entry = (logs[SESSION_LOG_ID] ?? []).find((e) => e.id === entryId);
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

		const linkClass = [...link.classList].find(c => c.endsWith('-link'));
		if (!linkClass) return;

		// One lookahead per data-* attribute — order independent.
		const dataLookaheads = Object.entries(link.dataset)
			.map(([camel, val]) => {
				const attr = camel.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
				return `(?=[^>]*\\bdata-${esc(attr)}="${esc(val ?? '')}")`;
			})
			.join('');

		const re = new RegExp(
			`<a\\b(?=[^>]*\\bclass="${esc(linkClass)}")${dataLookaheads}[^>]*>[\\s\\S]*?<\\/a>`,
		);
		const newHtml = entry.html.replace(re, `<s class="resource-spent">${link.textContent}</s>`);
		updateLogEntryHtml(SESSION_LOG_ID, entryId, newHtml);
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
			const cost    = parseInt(xpLink.dataset['cost'] ?? '0', 10);
			const entryId = xpLink.dataset['entryId'] ?? '';
			const charId  = xpLink.dataset['charId']  ?? '';
			if (!cost || !entryId || !charId) return;
			const entry = (logs[SESSION_LOG_ID] ?? []).find((ev) => ev.id === entryId);
			if (entry) {
				const newHtml = entry.html.replace(
					/<a\b[^>]*class="xp-cost-link"[^>]*>([^<]*)<\/a>/,
					'<s class="xp-spent">$1</s>',
				);
				updateLogEntryHtml(SESSION_LOG_ID, entryId, newHtml);
			}
			triggerXpSpend(charId, cost);
			return;
		}

		// ---- Resource links ----
		const resLink = target.closest('.resource-link') as HTMLElement | null;
		if (resLink && !resLink.closest('.resource-spent')) {
			e.preventDefault();
			const resource = resLink.dataset['resource'] ?? '';
			const value    = parseInt(resLink.dataset['value'] ?? '0', 10);
			const entryId  = resLink.dataset['entryId'] ?? '';
			const charId   = resLink.dataset['charId']  ?? '';
			if (!resource || !value || !entryId || !charId) return;
			markLinkSpent(entryId, resLink);
			triggerAction({ charId, type: 'resource', key: resource, value });
			// Overflow and floor-overflow cascades.
			if (value < 0 && ctx) {
				const currentVal = (ctx.data as unknown as Record<string, number>)[resource] ?? 0;
				// Overflow: resource drops below 0 — excess converts to another resource.
				const overflowRule = OVERFLOW_RULES.find(r => r.resource === resource);
				if (overflowRule) {
					const newVal = currentVal + value;
					if (newVal < 0) {
						const overflow   = Math.abs(newVal);
						const overflowId = crypto.randomUUID();
						const html = overflowRule.logHtml({ overflow, charId, entryId: overflowId });
						appendLog(SESSION_LOG_ID, overflowRule.logTitle, html, overflowId);
					}
				}
				// Floor overflow: resource already at minimum — trigger cascade move.
				const floorOverflowRule = FLOOR_OVERFLOW_RULES.find(r => r.resource === resource && currentVal <= r.floor);
				if (floorOverflowRule) {
					const overflow   = Math.abs(value);
					const overflowId = crypto.randomUUID();
					const html = floorOverflowRule.logHtml({ overflow, charId, entryId: overflowId });
					appendLog(SESSION_LOG_ID, floorOverflowRule.logTitle, html, overflowId);
				}
			}
			return;
		}

		// ---- Debility links ----
		const debLink = target.closest('.debility-link') as HTMLElement | null;
		if (debLink && !debLink.closest('.resource-spent')) {
			e.preventDefault();
			const debility = debLink.dataset['debility'] ?? '';
			const value    = parseInt(debLink.dataset['value'] ?? '1', 10);
			const entryId  = debLink.dataset['entryId'] ?? '';
			const charId   = debLink.dataset['charId']  ?? '';
			if (!debility || !entryId || !charId) return;
			markLinkSpent(entryId, debLink);
			triggerAction({ charId, type: 'debility', key: debility, value });
			return;
		}

		// ---- Failure links ----
		const failureLink = target.closest('.failure-link') as HTMLElement | null;
		if (failureLink && !failureLink.closest('.resource-spent')) {
			e.preventDefault();
			const entryId = failureLink.dataset['entryId'] ?? '';
			const charId  = failureLink.dataset['charId']  ?? '';
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
			const burnEntryId = burnLink.dataset['entryId']     ?? '';
			const charId      = burnLink.dataset['charId']      ?? '';
			if (!rollEntryId || !burnEntryId || !charId) return;
			if (!ctx || ctx.charId !== charId || ctx.data.momentum <= 0) return;
			const rollEntry = getLog(SESSION_LOG_ID).find(e => e.id === rollEntryId);
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
			onOracleLink?.(oracleKey);
			return;
		}

		// ---- Progress links ----
		const progLink = target.closest('.progress-link') as HTMLElement | null;
		if (progLink && !progLink.closest('.resource-spent')) {
			e.preventDefault();
			const track   = progLink.dataset['track'] ?? '';
			const value   = parseInt(progLink.dataset['value'] ?? '1', 10);
			const entryId = progLink.dataset['entryId'] ?? '';
			if (!track || !value || !entryId) return;
			markLinkSpent(entryId, progLink);
			onProgressLink?.(track, value);
			return;
		}

		// ---- Initiative links ----
		const initLink = target.closest('.initiative-link') as HTMLElement | null;
		if (initLink && !initLink.closest('.resource-spent')) {
			e.preventDefault();
			const value   = initLink.dataset['value'] ?? '';
			const entryId = initLink.dataset['entryId'] ?? '';
			if (!value || !entryId) return;
			markLinkSpent(entryId, initLink);
			onInitiativeLink?.(value);
			return;
		}

		// ---- Menace links ----
		const menaceLink = target.closest('.menace-link') as HTMLElement | null;
		if (menaceLink && !menaceLink.closest('.resource-spent')) {
			e.preventDefault();
			const value   = parseInt(menaceLink.dataset['value'] ?? '1', 10);
			const entryId = menaceLink.dataset['entryId'] ?? '';
			if (!value || !entryId) return;
			markLinkSpent(entryId, menaceLink);
			onMenaceLink?.(value);
			return;
		}

		// ---- Vanquish foe links ----
		const vanquishLink = target.closest('.vanquish-foe-link') as HTMLElement | null;
		if (vanquishLink && !vanquishLink.closest('.resource-spent')) {
			e.preventDefault();
			const entryId = vanquishLink.dataset['entryId'] ?? '';
			if (!entryId) return;
			markLinkSpent(entryId, vanquishLink);
			onVanquishFoe?.();
			return;
		}
	}

	/** Selector covering all interactive link classes — used for touchend fast-tap. */
	const LINK_SELECTOR = [
		'.resource-link', '.move-link', '.oracle-link', '.initiative-link',
		'.progress-link', '.debility-link', '.menace-link', '.vanquish-foe-link',
		'.burn-momentum-link', '.xp-cost-link', '.failure-link',
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
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div class="log-entries" role="log" aria-live="polite" aria-label="Session log"
		tabindex="-1"
		onclick={handleEntriesClick}
		ontouchstart={handleEntriesTouchStart}
		ontouchend={handleEntriesTouchEnd}>
		{#if entries.length === 0}
			<div class="log-empty">
				<span class="log-empty-icon">◊</span>
				<span>No changes recorded yet.</span>
				<span class="log-empty-sub">Changes to the log will appear here.</span>
			</div>
		{:else}
			{#each entries as entry (entry.id)}
				<div class="log-entry" data-entry-id={entry.id}>
					<!-- Header row: title, time, and hover-reveal action buttons -->
					<div class="entry-header">
						<span class="entry-title">{entry.title}</span>

						<!-- Action buttons — opacity 0, revealed on .log-entry:hover -->
						<div class="entry-actions">
							<button
								class="entry-btn entry-edit-btn"
								class:entry-btn-active={editingId === entry.id}
								onclick={() => editingId === entry.id ? cancelEdit() : startEdit(entry)}
								title={editingId === entry.id ? 'Cancel edit' : entry.title === 'Note' ? 'Edit note' : 'Add/edit note'}
								aria-label={entry.title === 'Note' ? 'Edit this note' : 'Edit note for this entry'}
							>{@html penSvg}</button>

							<button
								class="entry-btn entry-delete-btn"
								onclick={() => {
									if (editingId === entry.id) cancelEdit();
									deleteLogEntry(SESSION_LOG_ID, entry.id);
								}}
								title="Delete this log entry"
								aria-label="Delete log entry"
							>{@html trashSvg}</button>
						</div>
					</div>

					<!-- Entry body — hidden when editing a Note entry (textarea replaces it) -->
					{#if !(editingId === entry.id && entry.title === 'Note' && entry.source != null)}
						<div class="entry-body">{@html entry.html}</div>
					{/if}

					<!-- Inline editor: for Note entries edits main content; for others edits sub-note -->
					{#if editingId === entry.id}
						<div class="entry-edit">
							<textarea
								class="note-input"
								rows={entry.title === 'Note' ? 6 : 3}
								placeholder={entry.title === 'Note' ? 'Edit your note…' : 'Add a note…'}
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
						<div class="entry-note">{@html renderNote(entry.note)}</div>
					{/if}
				</div>
			{/each}
		{/if}
	</div>
</div>

<!-- Clear-log confirmation dialog -->
<ConfirmDialog
	bind:this={clearDialogRef}
	title="Clear Session Log?"
	onconfirm={confirmClear}
	confirmLabel="Clear Log"
>
	<p style="font-family: var(--font-ui); font-size: 0.82rem; color: var(--text-muted); margin: 0; line-height: 1.5;">
		This will permanently remove all {entries.length} {entries.length === 1 ? 'entry' : 'entries'}.
		This cannot be undone.
	</p>
</ConfirmDialog>

<style>
	.log-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: transparent;
	}

	.log-entries {
		flex: 1;
		overflow-y: auto;
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
		color: var(--text-dimmer);
		font-family: var(--font-ui);
		font-size: 0.68rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.log-empty-icon {
		font-size: 1.8rem;
		opacity: 0.3;
		line-height: 1;
		margin-bottom: 4px;
	}

	.log-empty-sub {
		font-family: var(--font-ui);
		font-size: 0.8rem;
		font-style: italic;
		text-transform: none;
		letter-spacing: 0;
		margin-top: 2px;
	}

	/* ---- Log entry ---- */
	.log-entry {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 3px;
		padding: 6px 9px;
		position: relative;
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
		transition: opacity 0.15s, color 0.12s, border-color 0.12s;
	}

	/* Reveal buttons when hovering the entry */
	.log-entry:hover .entry-btn { opacity: 1; }

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

	.entry-delete-btn {
		color: var(--text-dimmer);
	}
	.entry-delete-btn:hover {
		color: var(--color-danger);
		border-color: var(--color-danger);
	}

	/* ---- Entry body ---- */
	.entry-body {
		font-family: var(--font-ui);
		font-size: 0.82rem;
		color: var(--text-muted);
		line-height: 1.4;
	}

	.entry-body :global(.dialog-only) { display: none; }
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
	.entry-body :global(.failure-link:hover) { opacity: 0.8; }

	/* Interactive links in move outcomes */
	.entry-body :global(.resource-link),
	.entry-body :global(.move-link),
	.entry-body :global(.oracle-link),
	.entry-body :global(.initiative-link),
	.entry-body :global(.progress-link),
	.entry-body :global(.debility-link),
	.entry-body :global(.menace-link),
	.entry-body :global(.vanquish-foe-link),
	.entry-body :global(.burn-momentum-link) {
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
	.entry-body :global(.burn-momentum-link:hover) {
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

	.btn-sm { padding: 2px 8px; font-size: 0.68rem; }

	.btn-primary {
		background: var(--text-accent);
		border-color: var(--text-accent);
		color: var(--bg-card);
		font-weight: 600;
	}
	.btn-primary:hover { opacity: 0.88; }

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

</style>
