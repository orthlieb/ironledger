<script lang="ts">
	/**
	 * A resource meter with − value + buttons.
	 * Handles momentum (with reset ↺ and dynamic max), health, spirit, supply, mana.
	 * Supports icon (raw SVG string), tooltip, and onchange callback for logging.
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
		icon = '',
		tooltip = '',
		onchange,
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
		/** Raw SVG string for the label icon */
		icon?: string;
		/** Tooltip text shown on hover */
		tooltip?: string;
		onchange?: (oldVal: number, newVal: number) => void;
	} = $props();

	const isNegative = $derived(value < 0);

	function decrement() {
		const next = Math.max(min, value - 1);
		if (next !== value) { onchange?.(value, next); value = next; }
	}

	function increment() {
		const next = Math.min(max, value + 1);
		if (next !== value) { onchange?.(value, next); value = next; }
	}

	function doReset() {
		if (resetValue !== value) { onchange?.(value, resetValue); value = resetValue; }
	}
</script>

<div class="meter">
	<div class="meter-label" style:color title={tooltip || undefined}>
		{#if icon}<span class="meter-icon" aria-hidden="true">{@html icon}</span>{/if}
		{label}
	</div>
	<div class="meter-row">
		<button
			class="btn btn-icon"
			onclick={decrement}
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
			onclick={increment}
			disabled={value >= max || incDisabled}
			aria-label="Increase {label}"
		>+</button>

		{#if showReset}
			<button
				class="btn btn-icon reset-btn"
				onclick={doReset}
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
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		display: flex;
		align-items: center;
		gap: 4px;
		cursor: default;
	}

	.meter-icon {
		display: flex;
		align-items: center;
		flex-shrink: 0;
	}

	.meter-icon :global(svg) {
		width: 10px;
		height: 10px;
		fill: currentColor;
	}

	.meter-row {
		display: flex;
		align-items: center;
		gap: 3px;
	}

	.meter-value {
		font-family: var(--font-ui);
		font-size: 1.3rem;
		font-weight: 700;
		min-width: 2rem;
		text-align: center;
		font-variant-numeric: tabular-nums;
		line-height: 1;
		transition: color 0.15s;
	}

	.meter-max {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		color: var(--text-dimmer);
	}

	.reset-btn {
		font-size: 1rem;
		padding: 2px 5px;
	}
</style>
