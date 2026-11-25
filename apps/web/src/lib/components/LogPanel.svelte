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
		burnMomentumOffer,
		outcomeClass,
		outcomeLabel,
		moveOutcomeBlock,
	} from '#lib/moveRoll.js';
	import { inertBody } from '#lib/inertHtml.js';
	import {
		type LogEntry,
		initLog,
		clearLog,
		deleteLogEntry,
		updateLogEntryHtml,
		getLog,
		sessionLog,
		triggerAction,
	} from '#lib/log.svelte.js';
	import { bindCommandLinks, readCommandLink, spendCommandLink } from '#lib/commands/links.js';
	import { runLink, reportCommandResult } from '#lib/commands/run.svelte.js';
	import type { DiceCtx } from '#lib/diceContext.svelte.js';
	import { headingText } from '#lib/fontStore.svelte.js';
	import { matchNoteHtml } from '#lib/rollMatch.js';
	import { momentumReset } from '#lib/character.js';
	import { tooltip } from '#lib/actions/tooltip.js';
	import { findMove } from '#lib/moveStore.svelte.js';
	import { renderNote } from '#lib/markdown.js';
	import { parseStorySource } from '#lib/aiSerialize.js';
	import { sanitizeLogHtml, sanitizeNoteHtml } from '#lib/sanitize.js';
	import trashSvg from '#icons/trash-solid.svg?raw';
	import penSvg from '#icons/pen-to-square-solid.svg?raw';
	import anglesLeftSvg from '#icons/angles-left-solid.svg?raw';
	import anglesRightSvg from '#icons/angles-right-solid.svg?raw';
	import broomWideSvg from '#icons/broom-wide-solid.svg?raw';
	import { appIcon } from '#lib/liveryIcons.js';
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
	} from '#lib/sectionStore.svelte.js';
	import caretUpSvg from '#icons/caret-large-up-solid.svg?raw';
	import caretDownSvg from '#icons/caret-large-down-solid.svg?raw';
	import rotateRightSvg from '#icons/arrow-rotate-right-solid.svg?raw';

	// ---------------------------------------------------------------------------
	// Props. Links in entries are commands (#lib/commands/links.ts): a click
	// runs one against the entry's binding, so the panel needs only the active
	// character, for burning momentum.
	// ---------------------------------------------------------------------------
	let {
		ctx = null,
	}: {
		ctx?: DiceCtx | null;
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

	// `/burn` in the command bar: burn momentum on the newest action roll, as
	// its burn link would, and spend that link. The bar hears back through
	// `reply`.
	$effect(() => {
		const onBurn = (e: Event) => {
			const d = (
				e as CustomEvent<{ rollId?: string; reply?: (message: string, ok: boolean) => void }>
			).detail;
			(d?.reply ?? (() => {}))(...burnRoll(d?.rollId));
		};
		document.addEventListener('ironledger:burn', onBurn);
		return () => document.removeEventListener('ironledger:burn', onBurn);
	});

	/** Burn momentum on an action roll: the one a burn link was offered on,
	 *  or, typed, the newest, if a burn is on offer for it (whose link is then
	 *  spent). Momentum since fallen too low to improve it burns nothing and
	 *  spends the offer: its moment has passed. The message for the command
	 *  bar, and whether it burned. */
	function burnRoll(rollId?: string): [string, boolean] {
		const entries = getLog();
		const roll = rollId
			? entries.find((x) => x.id === rollId)
			: entries.find((x) => x.roll || x.html.includes('class="roll-burn"'));
		const which = rollId ? 'that' : 'the newest';
		if (!roll) return ['No action roll to burn momentum on.', false];
		if (!roll.roll) return [`Momentum is already burned on ${which} roll.`, false];
		const offer = entries.find(
			(x) => x.html.includes(`data-cmd="/burn"`) && offerFor(x.html, roll.id),
		);
		if (!rollId && !offer) return ['Burning momentum wouldn’t improve the newest roll.', false];
		if (!ctx || ctx.charId !== roll.roll.charId)
			return ['Make the character who rolled active to burn their momentum.', false];
		const mom = ctx.data.momentum;
		const { actionScore, c1, c2 } = roll.roll;
		const improves = burnMomentumOffer({
			momentum: mom,
			cancelled: false,
			c1,
			c2,
			hits1: actionScore > c1,
			hits2: actionScore > c2,
		});
		if (!improves) {
			if (offer) spendOffer(offer, roll.id);
			return [
				mom <= 0
					? 'No momentum to burn: the offer is spent.'
					: `Momentum ${mom} no longer improves ${which} roll: the offer is spent.`,
				false,
			];
		}
		const reset = momentumReset(ctx.data);
		// A burn link's click spends it (LogPanel's click handler); typed, the
		// offer is spent here.
		if (!rollId && offer) spendOffer(offer, roll.id);
		burnMomentum(roll);
		return [`Burned momentum (${mom} → reset ${reset}).`, true];
	}

	/** Strike an entry's burn link for a roll through. */
	function spendOffer(offer: { id: string; html: string }, rollId: string): void {
		const at = offerFor(offer.html, rollId);
		if (at) updateLogEntryHtml(offer.id, spendCommandLink(offer.html, at.index, '/burn'));
	}

	/** An entry's unspent burn link for a roll, and its place. */
	function offerFor(html: string, rollId: string): { index: number | undefined } | null {
		const m = html.match(
			new RegExp(`<a class="cmd-link"(?=[^>]*\\sdata-roll-entry-id="${rollId}")[^>]*>`),
		);
		if (!m || !m[0].includes('data-cmd="/burn"')) return null;
		const i = m[0].match(/\sdata-link="(\d+)"/);
		return { index: i ? Number(i[1]) : undefined };
	}

	// Mobile tap-tracking — used by touchend delegation to distinguish taps from scrolls.
	let _touchStartX = 0;
	let _touchStartY = 0;

	// ---------------------------------------------------------------------------
	// Burn Momentum
	// ---------------------------------------------------------------------------

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

		// The new outcome's text, built as the roll builds it (moveOutcomeBlock)
		// and its links bound as the roll's were.
		const move = findMove(moveId);
		const outcome = move
			? moveOutcomeBlock(move, newHits1, newHits2, {
					foeHarm: entry.roll.bind?.harm,
					curHealth: ctx.data.health,
					curSpirit: ctx.data.spirit,
					stat: entry.roll.stat,
				})
			: '';
		const outcomeTextHtml = outcome
			? bindCommandLinks(outcome, entry.id, { charId, ...entry.roll.bind })
			: '';

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
		const tmp = inertBody(html);
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

	/**
	 * Event delegation for the links in log entries. Each is a command
	 * (#lib/commands/links.ts): a click runs it against the entry's binding —
	 * its character, foe, expedition, vow or companion — and strikes it
	 * through once it has run, a value already so included. The command bar's status line
	 * says what happened, or why it couldn't. Old link forms (saved before
	 * links were commands) do nothing: their text stays.
	 * Accepts both MouseEvent (desktop click) and TouchEvent (mobile touchend).
	 */
	function handleEntriesClick(e: Event) {
		const target = e.target as HTMLElement;
		const link = target.closest('a.cmd-link') as HTMLElement | null;
		if (!link || link.closest('.resource-spent')) return;
		e.preventDefault();
		const { cmd, bind, entryId, index } = readCommandLink(link);
		const r = runLink(cmd, bind);
		if (r.spend && entryId) {
			const entry = sessionLog.entries.find((x) => x.id === entryId);
			if (entry) updateLogEntryHtml(entryId, spendCommandLink(entry.html, index, cmd));
		}
		reportCommandResult(r);
	}

	/** Selector for the links a fast tap acts on (touchend). */
	const LINK_SELECTOR = 'a.cmd-link';

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
		<span class="log-title-icon" aria-hidden="true">{@html appIcon('log')}</span>
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
				<span class="log-empty-icon" aria-hidden="true">{@html appIcon('log')}</span>
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
									aria-label="Regenerate this story">{@html rotateRightSvg}</button
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
		/* One text size for everything inside an entry — title, body, roll
		   lines, outcomes, notes and the note editor all read at this size.
		   Hierarchy comes from weight / colour / case, not size. */
		--log-entry-font-size: 0.82rem;
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
		font-size: var(--log-entry-font-size);
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

	/* Story regenerate — rotate icon, sized by the shared .entry-btn svg rule. */
	.entry-regen-btn {
		color: var(--text-dimmer);
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
		cursor: default;
	}
	/* Disabled marker buttons: still hide with the rest when the row isn't
	   hovered (opacity: 0 from .entry-btn), just dim while hovered so the
	   user can see they're intentionally inert. */
	.log-entry:hover .entry-marker-btn:disabled {
		opacity: 0.25;
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
		font-size: var(--log-entry-font-size);
		color: var(--text-muted);
		line-height: 1.4;
	}

	/* Entry HTML carries global classes (app.css gives .roll-line,
	   .roll-cancel, .roll-outcome-*, .roll-match-note etc. their own sizes
	   for DiceRollerDialog); inside the log everything inherits the entry
	   size instead. */
	.entry-body :global(*),
	.entry-note :global(*) {
		font-size: inherit;
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

	/* Dice roll lines share the entry's proportional UI font (app.css gives
	   them --font-mono globally for DiceRollerDialog; the log overrides that
	   so every entry reads in one face). Tabular figures keep the dice
	   values and totals column-aligned the way monospace used to. */
	.entry-body :global(.roll-line),
	.entry-body :global(.roll-cancel),
	.entry-body :global(.roll-outcome-strong),
	.entry-body :global(.roll-outcome-weak),
	.entry-body :global(.roll-outcome-miss) {
		font-family: inherit;
		font-variant-numeric: tabular-nums;
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
	}
	.entry-body :global(.roll-burn) {
		color: var(--color-momentum, #60a5fa);
		font-weight: 600;
	}

	/* Move outcome text (embedded in log entries from moves) */
	.entry-body :global(.move-outcome) {
		margin-top: 4px;
		padding: 4px 8px;
		border-left: 2px solid var(--border-mid);
		background: color-mix(in srgb, var(--bg-inset) 60%, transparent);
		border-radius: 0 3px 3px 0;
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
	/* Settlement: Type population tag appended to the rolled result. */
	.entry-body :global(.move-outcome .oracle-pop) {
		font-variant-numeric: tabular-nums;
		color: var(--text-dimmer);
		white-space: nowrap;
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
	/* Command links (#lib/commands/links.ts): a click runs the command. */
	.entry-body :global(a.cmd-link) {
		color: var(--text-accent);
		text-decoration: underline;
		cursor: pointer;
		/* Removes 300 ms tap delay on mobile — browser won't wait for double-tap-to-zoom. */
		touch-action: manipulation;
	}
	.entry-body :global(a.cmd-link:hover) {
		opacity: 0.8;
	}
	.entry-body :global(.move-failure-row a.cmd-link) {
		color: var(--color-danger, #ef4444);
		font-weight: 600;
	}
	.entry-body :global(.resource-spent),
	.entry-body :global(.xp-spent) {
		text-decoration: line-through;
		color: var(--text-dimmer);
		cursor: default;
		font-weight: normal;
	}
	/* Links saved before links were commands do nothing now: their text
	   reads as plain text. */
	.entry-body :global(a:not(.cmd-link)[class$='-link']) {
		color: inherit;
		text-decoration: none;
		cursor: text;
		pointer-events: none;
	}

	/* Harm placeholder: no foe context — player resolves manually */
	.entry-body :global(.harm-note) {
		font-style: italic;
		color: var(--text-dimmer);
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
		font-size: var(--log-entry-font-size);
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
	/* The Save button in the note-edit row uses the app-wide
	   `.btn .btn-primary` in app.css. Do not redefine .btn-primary
	   here — a local override would silently shadow the global. */

	/* ---- Saved note display (markdown-rendered) ---- */
	.entry-note {
		margin-top: 5px;
		padding: 4px 7px;
		border-left: 2px solid var(--border-mid);
		font-family: var(--font-ui);
		font-size: var(--log-entry-font-size);
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
