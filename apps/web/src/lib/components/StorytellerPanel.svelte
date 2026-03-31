<script lang="ts">
	/**
	 * StorytellerPanel — displays AI-generated narrative commentary.
	 *
	 * Shows a compact panel below the session log with the latest narration
	 * from the AI storyteller. Streams text token-by-token with a typing
	 * indicator while generating.
	 */
	import {
		isStorytellerEnabled,
		isStorytellerStreaming,
		getStorytellerText,
		getStorytellerError,
		cancelNarration,
	} from '$lib/storytellerStore.svelte.js';

	const enabled   = $derived(isStorytellerEnabled());
	const streaming = $derived(isStorytellerStreaming());
	const text      = $derived(getStorytellerText());
	const error     = $derived(getStorytellerError());

	const visible = $derived(enabled && (!!text || streaming || !!error));

	let panelEl = $state<HTMLElement | null>(null);

	// Auto-scroll to bottom as new text streams in
	$effect(() => {
		if (text && panelEl) {
			panelEl.scrollTop = panelEl.scrollHeight;
		}
	});
</script>

{#if visible}
	<div class="st-panel" bind:this={panelEl}>

		<div class="st-header">
			<span class="st-label">Storyteller</span>
			{#if streaming}
				<button class="st-stop" onclick={cancelNarration} title="Stop narration">
					&#9632;
				</button>
			{/if}
		</div>

		<div class="st-body">
			{#if error}
				<span class="st-error">{error}</span>
			{:else}
				<span class="st-text">{text}</span>
				{#if streaming}
					<span class="st-cursor"></span>
				{/if}
			{/if}
		</div>

	</div>
{/if}

<style>
	.st-panel {
		background:    var(--bg-inset);
		border-top:    1px solid var(--border);
		max-height:    160px;
		overflow-y:    auto;
		scrollbar-width: thin;
	}

	.st-header {
		display:         flex;
		align-items:     center;
		justify-content: space-between;
		padding:         6px 14px 0;
	}

	.st-label {
		font-family:    var(--font-display, 'Cinzel', serif);
		font-size:      0.62rem;
		font-weight:    700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color:          var(--text-accent);
		opacity:        0.7;
	}

	.st-stop {
		background:    transparent;
		border:        none;
		color:         var(--text-dimmer);
		cursor:        pointer;
		font-size:     0.7rem;
		padding:       0 4px;
		line-height:   1;
	}
	.st-stop:hover { color: var(--color-danger, #ef4444); }

	.st-body {
		padding:     6px 14px 10px;
		font-family: var(--font-ui);
		font-size:   0.78rem;
		line-height: 1.55;
		color:       var(--text-muted);
		font-style:  italic;
	}

	.st-text {
		white-space: pre-wrap;
	}

	.st-error {
		color:      var(--color-danger, #ef4444);
		font-style: normal;
		font-size:  0.72rem;
	}

	.st-cursor {
		display:          inline-block;
		width:            6px;
		height:           1em;
		background:       var(--text-accent);
		margin-left:      2px;
		vertical-align:   text-bottom;
		animation:        st-blink 0.8s step-end infinite;
	}

	@keyframes st-blink {
		0%, 100% { opacity: 1; }
		50%      { opacity: 0; }
	}
</style>
