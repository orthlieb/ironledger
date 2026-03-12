<script lang="ts">
	/**
	 * A display-only stat control with coloured label and bordered value box.
	 * Used for Edge, Heart, Iron, Shadow, Wits.
	 * Stats rarely change so ± buttons have been intentionally removed.
	 */
	let {
		label,
		value = $bindable(1),
		color = 'var(--text)',
		min = 1,
		max = 4,
		icon = '',
		tooltip = '',
	}: {
		label: string;
		value?: number;
		color?: string;
		min?: number;
		max?: number;
		/** Raw SVG string for the label icon */
		icon?: string;
		/** Tooltip text shown on hover */
		tooltip?: string;
	} = $props();
</script>

<div class="stat-control" title={tooltip || undefined}>
	<div class="stat-label" style:color>
		{#if icon}<span class="stat-icon" aria-hidden="true">{@html icon}</span>{/if}
		{label}
	</div>
	<div class="stat-value-box" style:border-color={color} style:color>
		{value}
	</div>
</div>

<style>
	.stat-control {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 5px;
		cursor: default;
	}

	.stat-label {
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.09em;
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.stat-icon {
		display: flex;
		align-items: center;
		flex-shrink: 0;
	}

	.stat-icon :global(svg) {
		width: 10px;
		height: 10px;
		fill: currentColor;
	}

	.stat-value-box {
		font-size: 1.5rem;
		font-weight: 800;
		min-width: 2.2rem;
		text-align: center;
		font-variant-numeric: tabular-nums;
		line-height: 1;
		padding: 4px 6px;
		border: 2px solid;
		border-radius: 3px;
		background: color-mix(in srgb, currentColor 8%, var(--bg-card));
	}
</style>
