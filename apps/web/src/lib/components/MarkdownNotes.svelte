<script lang="ts">
	/**
	 * Click-to-edit markdown notes field.
	 *
	 * Display mode: rendered markdown HTML (or italic placeholder when empty).
	 * Click or press Enter to switch to a textarea. Blur returns to display.
	 *
	 * Supports both binding patterns:
	 *   • `bind:value={...}` — direct two-way binding.
	 *   • `value={...} oninput={fn}` — for parents whose data lives in
	 *     nested state and is updated through an update callback.
	 */
	import { renderNote } from '$lib/markdown.js';
	import { tooltip } from '$lib/actions/tooltip.js';

	let {
		value = $bindable(''),
		editing = $bindable(false),
		label,
		placeholder = 'Click to edit (markdown supported)',
		rows = 4,
		oninput,
	}: {
		value?: string;
		/** Bindable — true while the textarea is shown. Parents can read
		 *  this to e.g. hide a floating portrait during edit. */
		editing?: boolean;
		/** Optional uppercase label rendered above the field. */
		label?: string;
		/** Empty-state hint + textarea placeholder. */
		placeholder?: string;
		/** Number of textarea rows in edit mode (default 4). */
		rows?: number;
		/** Callback fired on every keystroke. Use this when `value` is
		 *  stored in nested state that the parent updates explicitly. */
		oninput?: (newValue: string) => void;
	} = $props();

	let textareaEl = $state<HTMLTextAreaElement | null>(null);

	$effect(() => { if (editing && textareaEl) textareaEl.focus(); });

	function onInput(e: Event) {
		const v = (e.target as HTMLTextAreaElement).value;
		value = v;
		oninput?.(v);
	}
</script>

<div class="md-notes">
	{#if label}
		<span class="md-notes-label">{label}</span>
	{/if}
	{#if editing}
		<textarea
			bind:this={textareaEl}
			class="md-notes-input"
			value={value ?? ''}
			oninput={onInput}
			onblur={() => (editing = false)}
			{placeholder}
			{rows}
		></textarea>
	{:else}
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div
			class="md-notes-display"
			role="button"
			tabindex="0"
			use:tooltip={'Click to edit (markdown supported)'}
			onclick={() => (editing = true)}
			onkeydown={(e) => { if (e.key === 'Enter') editing = true; }}
		>
			{#if value?.trim()}
				{@html renderNote(value)}
			{:else}
				<span class="md-notes-placeholder">{placeholder}</span>
			{/if}
		</div>
	{/if}
</div>

<style>
	.md-notes {
		display:        flex;
		flex-direction: column;
		gap:            4px;
	}
	.md-notes-label {
		font-family:    var(--font-ui);
		font-size:      0.65rem;
		font-weight:    700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color:          var(--text-dimmer);
	}
	.md-notes-input {
		width:        100%;
		min-height:   7em;
		font-family:  var(--font-ui);
		font-size:    0.85rem;
		line-height:  1.5;
		color:        var(--text);
		background:   var(--bg-inset);
		border:       1px solid var(--border);
		border-radius: 4px;
		padding:      8px 10px;
		outline:      none;
		resize:       vertical;
		box-sizing:   border-box;
	}
	.md-notes-input:focus { border-color: var(--text-accent); }

	.md-notes-display {
		cursor:      pointer;
		min-height:  1.5em;
		font-family: var(--font-ui);
		font-size:   0.85rem;
		line-height: 1.5;
		color:       var(--text);
	}
	.md-notes-display:focus-visible {
		outline:        2px solid var(--text-accent);
		outline-offset: 2px;
		border-radius:  2px;
	}
	.md-notes-placeholder {
		font-family: var(--font-ui);
		font-size:   0.85rem;
		color:       var(--text-dimmer);
		font-style:  italic;
	}
	.md-notes-display :global(p)            { margin: 0 0 0.6em; }
	.md-notes-display :global(p:last-child) { margin-bottom: 0; }
	.md-notes-display :global(ul),
	.md-notes-display :global(ol)           { margin: 0 0 0.6em; padding-left: 1.2em; }
	.md-notes-display :global(strong)       { font-weight: 700; color: var(--text); }
	.md-notes-display :global(em)           { font-style: italic; }
</style>
