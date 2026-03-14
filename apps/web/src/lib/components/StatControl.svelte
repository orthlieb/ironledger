<script lang="ts">
	/**
	 * A stat control with coloured label and bordered value box.
	 * Used for Edge, Heart, Iron, Shadow, Wits.
	 * Stats rarely change so ± buttons have been intentionally omitted.
	 * Standard Ironsworn range: 1–3.
	 * Fires onchange(oldVal, newVal) on blur when the value actually changed.
	 */
	let {
		label,
		value = $bindable(1),
		color = 'var(--text)',
		min = 1,
		max = 3,
		tooltip = '',
		onchange,
	}: {
		label: string;
		value?: number;
		color?: string;
		min?: number;
		max?: number;
		/** Tooltip text shown on hover */
		tooltip?: string;
		/** Fired when value is committed (on blur) and differs from the focused value */
		onchange?: (oldVal: number, newVal: number) => void;
	} = $props();

	// Capture value at focus time so we know what changed on blur
	let focusValue = 0;
</script>

<div class="stat-control" title={tooltip || undefined}>
	<div class="stat-label" style:color>
		{label}
	</div>
	<input
		type="number"
		class="stat-value-input"
		style:border-color={color}
		style:color
		bind:value
		{min}
		{max}
		onfocus={() => { focusValue = value; }}
		onblur={() => {
			const clamped = Math.min(max, Math.max(min, value || min));
			value = clamped;
			if (clamped !== focusValue) onchange?.(focusValue, clamped);
		}}
		aria-label="{label} stat value"
	/>
</div>

<style>
	.stat-control {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 5px;
	}

	.stat-label {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.stat-value-input {
		font-size: 0.82rem;
		font-weight: 700;
		width: 2.5rem;
		height: 27px; /* match the measured height of .touched-select */
		text-align: center;
		font-variant-numeric: tabular-nums;
		padding: 0 4px; /* vertical centering handled by height */
		border: 2px solid;
		border-radius: 3px;
		background: color-mix(in srgb, currentColor 8%, var(--bg-card));
		font-family: var(--font-ui);
		/* Hide browser number input spinners */
		-moz-appearance: textfield;
		appearance: textfield;
	}

	.stat-value-input::-webkit-outer-spin-button,
	.stat-value-input::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	/* Focus ring uses the stat color instead of global amber */
	.stat-value-input:focus {
		outline: none;
		box-shadow: 0 0 0 2px color-mix(in srgb, currentColor 30%, transparent);
	}
</style>
