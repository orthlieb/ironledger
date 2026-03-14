<script lang="ts">
	/**
	 * LogPanel — displays the reactive session log for a single character.
	 *
	 * Entries are stored in localStorage and rendered newest-first.
	 * Hovering an entry reveals delete and note-edit buttons (opacity 0 → 1).
	 * Notes are attached per-entry and persist to localStorage.
	 * Clearing the log requires confirmation via a native dialog (irreversible).
	 */
	import { logs, initLog, clearLog, deleteLogEntry, updateLogEntryNote, updateLogEntryHtml, triggerXpSpend, SESSION_LOG_ID } from '$lib/log.svelte.js';
	import { renderNote } from '$lib/markdown.js';
	import trashSvg from '$icons/trash-solid-full.svg?raw';
	import penSvg   from '$icons/pen-to-square-solid-full.svg?raw';

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
	let clearDialogEl = $state<HTMLDialogElement | null>(null);

	function formatTime(ts: string): string {
		try {
			return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		} catch {
			return '';
		}
	}

	function startEdit(entryId: string, currentNote: string | undefined) {
		editingId = entryId;
		draftNote = currentNote ?? '';
	}

	function saveEdit() {
		if (editingId) {
			updateLogEntryNote(SESSION_LOG_ID, editingId, draftNote);
			editingId = null;
			draftNote = '';
		}
	}

	function cancelEdit() {
		editingId = null;
		draftNote = '';
	}

	function confirmClear() {
		clearDialogEl?.close();
		clearLog(SESSION_LOG_ID);
	}

	/**
	 * Event-delegation handler for XP cost links rendered inside log entry bodies.
	 * Intercepts clicks on .xp-cost-link elements, marks the link as spent in
	 * the stored HTML, then calls triggerXpSpend() so CharacterSheet deducts XP.
	 */
	function handleEntriesClick(e: MouseEvent) {
		const link = (e.target as HTMLElement).closest('.xp-cost-link') as HTMLElement | null;
		if (!link || link.classList.contains('xp-spent')) return;
		e.preventDefault();

		const cost    = parseInt(link.dataset['cost']    ?? '0', 10);
		const entryId = link.dataset['entryId'] ?? '';
		const charId  = link.dataset['charId']  ?? '';
		if (!cost || !entryId || !charId) return;

		// Mark the link as spent in the global session log
		const entry = (logs[SESSION_LOG_ID] ?? []).find((ev) => ev.id === entryId);
		if (entry) {
			// Replace the first unspent xp-cost-link in this entry's HTML
			const newHtml = entry.html.replace(
				/<a\b[^>]*class="xp-cost-link"[^>]*>([^<]*)<\/a>/,
				'<s class="xp-spent">$1</s>',
			);
			updateLogEntryHtml(SESSION_LOG_ID, entryId, newHtml);
		}

		// Deduct XP from the specific character via the spend bus
		triggerXpSpend(charId, cost);
	}
</script>

<div class="log-panel">
	<div class="log-header">
		<div class="log-title-row">
			<span class="log-title">Session Log</span>
		</div>
		<button
			class="btn btn-icon icon-btn"
			onclick={() => clearDialogEl?.showModal()}
			title="Clear log"
			aria-label="Clear session log"
			disabled={entries.length === 0}
		>{@html trashSvg}</button>
	</div>

	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="log-entries" role="log" aria-live="polite" aria-label="Session log"
		onclick={handleEntriesClick}>
		{#if entries.length === 0}
			<div class="log-empty">
				<span class="log-empty-icon">◊</span>
				<span>No changes recorded yet.</span>
				<span class="log-empty-sub">Changes to the character will appear here.</span>
			</div>
		{:else}
			{#each entries as entry (entry.id)}
				<div class="log-entry">
					<!-- Header row: title, time, and hover-reveal action buttons -->
					<div class="entry-header">
						<span class="entry-title">{entry.title}</span>
						<span class="entry-time">{formatTime(entry.ts)}</span>

						<!-- Action buttons — opacity 0, revealed on .log-entry:hover -->
						<div class="entry-actions">
							<button
								class="entry-btn entry-edit-btn"
								class:entry-btn-active={editingId === entry.id}
								onclick={() => editingId === entry.id ? cancelEdit() : startEdit(entry.id, entry.note)}
								title={editingId === entry.id ? 'Cancel note' : 'Add/edit note'}
								aria-label="Edit note for this entry"
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

					<!-- Entry body (HTML from character events) -->
					<div class="entry-body">{@html entry.html}</div>

					<!-- Note: shown when note exists, or when this entry is being edited -->
					{#if editingId === entry.id}
						<div class="entry-edit">
							<textarea
								class="note-input"
								rows="3"
								placeholder="Add a note…"
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
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
	bind:this={clearDialogEl}
	class="clear-dialog"
	oncancel={() => clearDialogEl?.close()}
>
	<h3 class="clear-dialog-title">Clear Session Log?</h3>
	<p class="clear-dialog-body">
		This will permanently remove all {entries.length} {entries.length === 1 ? 'entry' : 'entries'}.
		This cannot be undone.
	</p>
	<div class="clear-dialog-btns">
		<button class="btn" onclick={() => clearDialogEl?.close()}>Cancel</button>
		<button class="btn btn-danger" onclick={confirmClear}>Clear Log</button>
	</div>
</dialog>

<style>
	.log-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--bg-inset);
		border-left: 1px solid var(--border);
	}

	.log-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 14px; /* same height as .tab-btn: controlled by min-height */
		min-height: 44px; /* matches tab-bar height */
		border-bottom: 1px solid var(--border);
		background: var(--bg-card);
		flex-shrink: 0;
		gap: 8px;
	}

	.log-title-row {
		display: flex;
		align-items: center;
	}

	.log-title {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-dimmer);
	}

	.icon-btn :global(svg) {
		width: 11px;
		height: 11px;
		fill: currentColor;
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

	.entry-time {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		letter-spacing: 0.02em;
		color: var(--text-dimmer);
		white-space: nowrap;
		flex-shrink: 0;
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

	.entry-body :global(strong) {
		color: var(--text);
		font-weight: 600;
	}

	.entry-body :global(div) {
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

	/* XP cost links (clickable, strike-through after use) */
	.entry-body :global(.xp-cost-link) {
		color: var(--text-accent);
		text-decoration: underline;
		font-weight: 600;
		cursor: pointer;
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

	/* ================================================================
	   Clear-log confirmation dialog
	   ================================================================ */
	.clear-dialog {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		margin: 0;
		border: 1px solid var(--border-mid);
		border-radius: 7px;
		padding: 16px 18px 14px;
		background: var(--bg-card);
		color: var(--text);
		width: min(340px, calc(100vw - 2rem));
		box-shadow: 0 8px 32px #00000060;
	}
	.clear-dialog::backdrop {
		background: #00000040;
		backdrop-filter: blur(1px);
	}

	.clear-dialog-title {
		font-family: var(--font-ui);
		font-size: 0.88rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		color: var(--text);
		margin: 0 0 10px;
	}

	.clear-dialog-body {
		font-family: var(--font-ui);
		font-size: 0.8rem;
		line-height: 1.5;
		color: var(--text-muted);
		margin: 0 0 16px;
	}

	.clear-dialog-btns {
		display: flex;
		gap: 6px;
		justify-content: flex-end;
	}

	.btn-danger {
		background: var(--bg-control);
		border-color: var(--color-danger);
		color: var(--color-danger);
	}
	.btn-danger:hover {
		background: var(--bg-hover);
	}
</style>
