<script lang="ts">
	/**
	 * A resource meter with − value + buttons.
	 * Handles momentum (with reset ↺ and dynamic max), health, spirit, supply, mana.
	 */
	let {
		label,
		value = $bindable(0),
		color = 'var(--text)',
		min = 0,
		max = 10,
		incDisabled = false,
		showReset = false,
		resetValue = 0,
		showMax = false,
	}: {
		label: string;
		value?: number;
		color?: string;
		min?: number;
		max?: number;
		/** Extra disable condition for the + button (e.g. debility blocking) */
		incDisabled?: boolean;
		showReset?: boolean;
		resetValue?: number;
		showMax?: boolean;
	} = $props();

	const isNegative = $derived(value < 0);
</script>

<div class="meter">
	<div class="meter-label">{label}</div>
	<div class="meter-row">
		<button
			class="btn btn-icon"
			onclick={() => (value = Math.max(min, value - 1))}
			disabled={value <= min}
			aria-label="Decrease {label}"
		>−</button>

		<span
			class="meter-value"
			class:negative={isNegative}
			style:color={isNegative ? 'var(--color-danger)' : color}
		>{value}</span>

		<button
			class="btn btn-icon"
			onclick={() => (value = Math.min(max, value + 1))}
			disabled={value >= max || incDisabled}
			aria-label="Increase {label}"
		>+</button>

		{#if showReset}
			<button
				class="btn btn-icon reset-btn"
				onclick={() => (value = resetValue)}
				title="Reset to {resetValue}"
				aria-label="Reset {label}"
			>↺</button>
		{/if}
	</div>

	{#if showMax}
		<div class="meter-max">max {max}</div>
	{/if}
</div>

<style>
	.meter {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		min-width: 64px;
	}

	.meter-label {
		font-size: 0.65rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-dimmer);
	}

	.meter-row {
		display: flex;
		align-items: center;
		gap: 3px;
	}

	.meter-value {
		font-size: 1.3rem;
		font-weight: 700;
		min-width: 2rem;
		text-align: center;
		font-variant-numeric: tabular-nums;
		line-height: 1;
		transition: color 0.15s;
	}

	.meter-max {
		font-size: 0.65rem;
		color: var(--text-dimmer);
	}

	.reset-btn {
		font-size: 1rem;
		padding: 2px 5px;
	}
</style>
