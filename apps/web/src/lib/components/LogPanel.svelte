<script lang="ts">
	/**
	 * LogPanel — displays the reactive session log for a single character.
	 * Entries are stored in localStorage and rendered newest-first.
	 */
	import { logs, initLog, clearLog } from '$lib/log.svelte.js';
	import trashSvg from '$lib/images/trash-solid.svg?raw';

	let {
		characterId,
		characterName = 'Character',
	}: {
		characterId: string;
		characterName?: string;
	} = $props();

	$effect(() => {
		initLog(characterId);
	});

	// Access logs[characterId] directly so Svelte 5's proxy records a
	// fine-grained dependency on this character's entries only.
	const entries = $derived(logs[characterId] ?? []);

	function formatTime(ts: string): string {
		try {
			return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		} catch {
			return '';
		}
	}
</script>

<div class="log-panel">
	<div class="log-header">
		<div class="log-title-row">
			<span class="log-title">Session Log</span>
			{#if characterName}
				<span class="log-char-name">{characterName}</span>
			{/if}
		</div>
		<button
			class="btn btn-icon icon-btn"
			onclick={() => clearLog(characterId)}
			title="Clear log"
			aria-label="Clear session log"
			disabled={entries.length === 0}
		>{@html trashSvg}</button>
	</div>

	<div class="log-entries" role="log" aria-live="polite" aria-label="Session log">
		{#if entries.length === 0}
			<div class="log-empty">
				<span class="log-empty-icon">◊</span>
				<span>No changes recorded yet.</span>
				<span class="log-empty-sub">Changes to the character will appear here.</span>
			</div>
		{:else}
			{#each entries as entry (entry.id)}
				<div class="log-entry">
					<div class="entry-header">
						<span class="entry-title">{entry.title}</span>
						<span class="entry-time">{formatTime(entry.ts)}</span>
					</div>
					<div class="entry-body">{@html entry.html}</div>
				</div>
			{/each}
		{/if}
	</div>
</div>

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
		padding: 12px 14px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-card);
		flex-shrink: 0;
		gap: 8px;
	}

	.log-title-row {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.log-title {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-dimmer);
	}

	.log-char-name {
		/* Character name — keep Cinzel as it's a title element */
		font-family: var(--font-display);
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		color: var(--text-accent);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 160px;
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
	}

	.log-empty-icon {
		font-size: 1.8rem;
		opacity: 0.3;
		line-height: 1;
		margin-bottom: 4px;
	}

	.log-empty {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.log-empty-sub {
		font-family: var(--font-body);
		font-size: 0.8rem;
		font-style: italic;
		text-transform: none;
		letter-spacing: 0;
		margin-top: 2px;
	}

	.log-entry {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 3px;
		padding: 6px 9px;
	}

	.entry-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 3px;
		gap: 8px;
	}

	.entry-title {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-accent);
		white-space: nowrap;
	}

	.entry-time {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		letter-spacing: 0.02em;
		color: var(--text-dimmer);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.entry-body {
		font-size: 0.82rem;
		color: var(--text-muted);
		line-height: 1.4;
	}

	/* Allow bold tags in log HTML to be visible */
	.entry-body :global(strong) {
		color: var(--text);
		font-weight: 600;
	}

	.entry-body :global(div) {
		margin-bottom: 1px;
	}
</style>
