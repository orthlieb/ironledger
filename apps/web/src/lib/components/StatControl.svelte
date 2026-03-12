<script lang="ts">
	/** A ± stat control with coloured label. Used for Edge, Heart, Iron, Shadow, Wits. */
	let {
		label,
		value = $bindable(1),
		color = 'var(--text)',
		min = 1,
		max = 4,
	}: {
		label: string;
		value?: number;
		color?: string;
		min?: number;
		max?: number;
	} = $props();
</script>

<div class="stat-control">
	<div class="stat-label" style:color>{label}</div>
	<div class="stat-row">
		<button
			class="btn btn-icon"
			onclick={() => (value = Math.max(min, value - 1))}
			disabled={value <= min}
			aria-label="Decrease {label}"
		>−</button>
		<span class="stat-value" style:color>{value}</span>
		<button
			class="btn btn-icon"
			onclick={() => (value = Math.min(max, value + 1))}
			disabled={value >= max}
			aria-label="Increase {label}"
		>+</button>
	</div>
</div>

<style>
	.stat-control {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
	}

	.stat-label {
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.09em;
	}

	.stat-row {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.stat-value {
		font-size: 1.5rem;
		font-weight: 800;
		min-width: 1.6rem;
		text-align: center;
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}
</style>
