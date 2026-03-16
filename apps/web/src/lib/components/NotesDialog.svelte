<script lang="ts">
	/**
	 * NotesDialog — modal for adding session notes to the log.
	 *
	 * Usage:
	 *   <NotesDialog bind:this={ref} />
	 *   ref.open()
	 */

	import { appendLog, SESSION_LOG_ID } from '$lib/log.svelte.js';
	import { draggable } from '$lib/actions/draggable.js';
	import { renderNote } from '$lib/markdown.js';

	// ---------------------------------------------------------------------------
	// Internal state
	// ---------------------------------------------------------------------------
	let dialogEl = $state<HTMLDialogElement | null>(null);
	let noteText = $state('');

	const hasContent = $derived(noteText.trim().length > 0);

	// ---------------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------------
	export function open() {
		noteText = '';
		dialogEl?.showModal();
		requestAnimationFrame(() => {
			dialogEl?.querySelector('textarea')?.focus();
		});
	}

	export function close() {
		dialogEl?.close();
	}

	// ---------------------------------------------------------------------------
	// Handlers
	// ---------------------------------------------------------------------------
	function addNote() {
		const text = noteText.trim();
		if (!text) return;
		appendLog(SESSION_LOG_ID, 'Note', renderNote(text), undefined, text);
		noteText = '';
		dialogEl?.close();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			addNote();
		}
	}
</script>

<dialog
	bind:this={dialogEl}
	class="notes-dialog"
	oncancel={close}
>
	<!-- Header -->
	<div class="nd-header" use:draggable>
		<span class="nd-title">Session Note</span>
		<button class="nd-close" onclick={close} aria-label="Close">✕</button>
	</div>

	<!-- Body -->
	<div class="nd-body">
		<textarea
			class="nd-textarea"
			placeholder="Type a note to insert into the log…"
			bind:value={noteText}
			onkeydown={handleKeydown}
			rows="6"
		></textarea>
		<div class="nd-hint">
			Supports **bold**, *italic*, # headings, - lists. Ctrl+Enter to add.
		</div>
	</div>

	<!-- Footer -->
	<div class="nd-footer">
		<button
			class="btn btn-primary nd-add-btn"
			onclick={addNote}
			disabled={!hasContent}
		>Add to Log</button>
	</div>
</dialog>

<style>
	/* ── Dialog shell ────────────────────────────────────────────────────── */
	.notes-dialog {
		border:        none;
		padding:       0;
		border-radius: 10px;
		position:      fixed;
		top:           50%;
		left:          50%;
		transform:     translate(-50%, -50%);
		width:         min(480px, calc(100vw - 2rem));
		background:    var(--bg-card);
		color:         var(--text);
		box-shadow:    0 16px 48px #00000070, 0 0 0 1px var(--border-mid);
		outline:       none;
	}
	.notes-dialog[open] {
		display:        flex;
		flex-direction: column;
	}
	.notes-dialog::backdrop {
		background:      #00000060;
		backdrop-filter: blur(1px);
	}

	/* ── Header ─────────────────────────────────────────────────────────── */
	.nd-header {
		display:       flex;
		align-items:   center;
		gap:           8px;
		padding:       10px 14px;
		border-bottom: 1px solid var(--border);
		background:    var(--bg-control);
		border-radius: 10px 10px 0 0;
		flex-shrink:   0;
	}
	.nd-title {
		font-family:    var(--font-display);
		font-size:      0.78rem;
		font-weight:    700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color:          var(--text-accent);
		flex:           1;
	}
	.nd-close {
		background:    transparent;
		border:        none;
		color:         var(--text-dimmer);
		cursor:        pointer;
		font-size:     0.9rem;
		padding:       2px 5px;
		border-radius: 3px;
		line-height:   1;
		font-family:   inherit;
		flex-shrink:   0;
	}
	.nd-close:hover { color: var(--text); }

	/* ── Body ───────────────────────────────────────────────────────────── */
	.nd-body {
		padding:        12px 14px;
		display:        flex;
		flex-direction: column;
		gap:            6px;
	}
	.nd-textarea {
		width:         100%;
		font-family:   var(--font-ui);
		font-size:     0.82rem;
		color:         var(--text);
		background:    var(--bg-inset);
		border:        1px solid var(--border);
		border-radius: 4px;
		padding:       8px 10px;
		resize:        vertical;
		min-height:    100px;
		line-height:   1.5;
	}
	.nd-textarea:focus {
		outline:      none;
		border-color: var(--focus-ring);
		box-shadow:   0 0 0 2px var(--accent-glow);
	}
	.nd-textarea::placeholder {
		color:      var(--text-dimmer);
		font-style: italic;
	}
	.nd-hint {
		font-family: var(--font-ui);
		font-size:   0.65rem;
		color:       var(--text-dimmer);
		font-style:  italic;
	}

	/* ── Footer ─────────────────────────────────────────────────────────── */
	.nd-footer {
		border-top:      1px solid var(--border);
		padding:         10px 14px;
		flex-shrink:     0;
		display:         flex;
		justify-content: flex-end;
	}
	.nd-add-btn {
		padding:         8px 20px;
		font-size:       0.8rem;
		justify-content: center;
	}
</style>
