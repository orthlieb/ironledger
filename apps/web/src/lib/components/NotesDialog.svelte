<script lang="ts">
	/**
	 * NotesDialog — modal for adding session notes to the log.
	 *
	 * Usage:
	 *   <NotesDialog bind:this={ref} />
	 *   ref.open()
	 */

	import { appendLog } from '$lib/log.svelte.js';
	import { Dialog } from 'bits-ui';
	import DialogHeader from '$lib/components/DialogHeader.svelte';
	import { renderNote } from '$lib/markdown.js';
	import { headingText } from '$lib/fontStore.svelte.js';

	// ---------------------------------------------------------------------------
	// Internal state
	// ---------------------------------------------------------------------------
	let dialogOpen = $state(false);
	let textareaEl = $state<HTMLTextAreaElement | null>(null);
	let noteText = $state('');

	const hasContent = $derived(noteText.trim().length > 0);

	// ---------------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------------
	export function open() {
		noteText = '';
		dialogOpen = true;
	}

	export function close() {
		dialogOpen = false;
	}

	// ---------------------------------------------------------------------------
	// Handlers
	// ---------------------------------------------------------------------------
	function addNote() {
		const text = noteText.trim();
		if (!text) return;
		appendLog('Note', renderNote(text), undefined, text);
		noteText = '';
		dialogOpen = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			addNote();
		}
	}
</script>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="nd-overlay" />
		<Dialog.Content
			class="notes-dialog"
			onOpenAutoFocus={(e) => {
				// Focus the textarea directly instead of the header's ✕
				// close button (bits-ui's default first-tabbable behavior).
				e.preventDefault();
				textareaEl?.focus();
			}}
		>
			<DialogHeader title={headingText('Session Note')} onclose={close} />

			<div class="nd-body">
				<textarea
					bind:this={textareaEl}
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

			<div class="nd-footer">
				<button class="btn btn-primary nd-add-btn" onclick={addNote} disabled={!hasContent}
					>Add to Log</button
				>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	/* bits-ui portals Content + Overlay to <body>, so every selector
	   below needs :global() — Svelte's CSS pruning can't see through
	   the portal. Overlay 80 / content 81 matches the modal z-index
	   tier documented in ui-components.md. */
	:global(.nd-overlay) {
		position: fixed;
		inset: 0;
		background: #00000060;
		backdrop-filter: blur(1px);
		z-index: 80;
	}
	:global(.notes-dialog) {
		display: flex;
		flex-direction: column;
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(480px, calc(100vw - 2rem));
		background: var(--bg-card);
		color: var(--text);
		border-radius: 10px;
		box-shadow:
			0 16px 48px #00000070,
			0 0 0 1px var(--border-mid);
		outline: none;
		z-index: 81;
	}

	:global(.nd-body) {
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	:global(.nd-textarea) {
		width: 100%;
		font-family: var(--font-ui);
		font-size: 0.82rem;
		color: var(--text);
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 8px 10px;
		resize: vertical;
		min-height: 100px;
		line-height: 1.5;
	}
	:global(.nd-textarea:focus) {
		outline: none;
		border-color: var(--focus-ring);
		box-shadow: 0 0 0 2px var(--accent-glow);
	}
	:global(.nd-textarea::placeholder) {
		color: var(--text-dimmer);
		font-style: italic;
	}
	:global(.nd-hint) {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		color: var(--text-dimmer);
		font-style: italic;
	}

	:global(.nd-footer) {
		border-top: 1px solid var(--border);
		padding: 10px 14px;
		flex-shrink: 0;
		display: flex;
		justify-content: flex-end;
	}
	:global(.nd-add-btn) {
		padding: 8px 20px;
		font-size: 0.8rem;
		justify-content: center;
	}
</style>
