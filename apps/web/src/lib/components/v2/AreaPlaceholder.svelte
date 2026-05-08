<script lang="ts">
	/**
	 * AreaPlaceholder — used for not-yet-implemented v2 deck areas.
	 * Renders the area frame with a centered title + subtitle so the layout
	 * is testable before the full deck stage is wired.
	 */
	let { title, subtitle }: { title: string; subtitle?: string } = $props();
</script>

<div class="placeholder">
	<header class="placeholder-header">
		<span class="placeholder-title">{title}</span>
	</header>
	<div class="placeholder-body">
		<div class="placeholder-card">
			<span class="placeholder-card-label">{title} deck</span>
			{#if subtitle}
				<span class="placeholder-card-sub">{subtitle}</span>
			{/if}
			<span class="placeholder-card-soon">— coming soon —</span>
		</div>
	</div>
</div>

<style>
	.placeholder {
		display: flex;
		flex-direction: column;
		height: 100%;
	}
	.placeholder-header {
		padding: 8px 12px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-control);
	}
	.placeholder-title {
		font-family:    var(--font-display);
		font-size:      calc(0.82rem * var(--font-display-scale));
		font-weight:    var(--font-display-weight);
		letter-spacing: 0.08em;
		text-transform: var(--font-display-transform);
		color:          var(--text-accent);
	}
	.placeholder-body {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px;
		min-height: 0;
	}
	.placeholder-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 28px 24px;
		background: var(--bg-card);
		border: 1px dashed var(--border-mid);
		border-radius: 8px;
		min-width: 200px;
		max-width: 320px;
	}
	.placeholder-card-label {
		font-family: var(--font-ui);
		font-size: 0.9rem;
		color: var(--text);
		font-weight: 600;
	}
	.placeholder-card-sub {
		font-family: var(--font-ui);
		font-size: 0.75rem;
		color: var(--text-muted);
		text-align: center;
		line-height: 1.4;
	}
	.placeholder-card-soon {
		margin-top: 6px;
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-style: italic;
		color: var(--text-dimmer);
	}
</style>
