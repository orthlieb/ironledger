<script lang="ts">
	/**
	 * TrackNotesDialog — the notes behind a progress track's note button:
	 * Bonds Formed for Bonds, Lessons Learned for Failures.
	 *
	 * Notes already written open rendered (click, or Enter, to edit);
	 * empty notes open straight into the textarea. The text is a draft:
	 * Save writes it back through `onsave`, Cancel (or the header close
	 * button, or Escape) drops it. Ctrl/Cmd+Enter saves.
	 *
	 * Usage: bind:this={ref}, then ref.open(currentNotes).
	 */
	import { Dialog } from 'bits-ui';
	import DialogHeader from '#lib/components/DialogHeader.svelte';
	import MarkdownNotes from '#lib/components/MarkdownNotes.svelte';
	import { headingText } from '#lib/fontStore.svelte.js';
	import { pushDialog, popDialog, overlayZ, contentZ } from '#lib/dialogStack.svelte.js';

	let {
		title,
		placeholder = '',
		onsave,
	}: {
		title: string;
		/** Hint in the empty notes. */
		placeholder?: string;
		/** Called with the edited notes on Save. */
		onsave: (value: string) => void;
	} = $props();

	let dialogOpen = $state(false);
	let draft = $state('');
	let editing = $state(false);
	let bodyEl = $state<HTMLElement | null>(null);

	let stackDepth = $state(1);
	$effect(() => {
		if (!dialogOpen) return;
		stackDepth = pushDialog();
		return () => popDialog();
	});

	export function open(value: string) {
		draft = value;
		editing = !value.trim();
		dialogOpen = true;
	}

	function close() {
		dialogOpen = false;
	}

	function save() {
		onsave(draft.trimEnd());
		dialogOpen = false;
	}
</script>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="tn-overlay" style="z-index: {overlayZ(stackDepth)}" />
		<Dialog.Content
			class="tn-dialog"
			data-tour="track-notes-dialog"
			style="z-index: {contentZ(stackDepth)}"
			onOpenAutoFocus={(e) => {
				// Land in the notes: the textarea when they're empty (MarkdownNotes
				// focuses it itself), else the rendered notes, where Enter edits.
				e.preventDefault();
				setTimeout(() => {
					const target = bodyEl?.querySelector<HTMLElement>('textarea, .md-notes-display');
					target?.focus();
				}, 0);
			}}
			onkeydown={(e) => {
				if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
					e.preventDefault();
					save();
				}
			}}
		>
			<DialogHeader title={headingText(title)} onclose={close} />

			<div class="tn-body" bind:this={bodyEl}>
				<MarkdownNotes bind:value={draft} bind:editing {placeholder} rows={8} />
			</div>

			<!-- mousedown keeps focus in the textarea: a blur would switch it back
			     to the rendered notes, shrinking the dialog under the click. -->
			<div class="tn-footer">
				<button class="btn" type="button" onmousedown={(e) => e.preventDefault()} onclick={close}
					>Cancel</button
				>
				<button
					class="btn btn-primary"
					type="button"
					data-tour="track-notes-save"
					onmousedown={(e) => e.preventDefault()}
					onclick={save}>Save</button
				>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	/* bits-ui portals Content + Overlay to <body>, so these need :global().
	   z-index is set inline via dialogStack. */
	:global(.tn-overlay) {
		position: fixed;
		inset: 0;
		background: #00000060;
		backdrop-filter: blur(1px);
	}
	:global(.tn-dialog) {
		display: flex;
		flex-direction: column;
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(520px, calc(100vw - 2rem));
		max-height: 80dvh;
		background: var(--bg-card);
		color: var(--text);
		border-radius: 10px;
		box-shadow:
			0 16px 48px #00000070,
			0 0 0 1px var(--border-mid);
		outline: none;
	}
	/* Long notes scroll here, between the title bar and the buttons. */
	:global(.tn-body) {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 12px 14px;
	}
	:global(.tn-body .md-notes-display) {
		min-height: 6em;
	}
	:global(.tn-footer) {
		flex-shrink: 0;
		display: flex;
		justify-content: flex-end;
		gap: 6px;
		padding: 10px 14px;
		border-top: 1px solid var(--border);
	}
</style>
