<script lang="ts">
	/**
	 * A stat control with coloured label and bordered value box.
	 * Used for Edge, Heart, Iron, Shadow, Wits.
	 * Stats rarely change so ± buttons have been intentionally omitted.
	 * Standard Ironsworn range: 1–3.
	 */
	let {
		label,
		value = $bindable(1),
		color = 'var(--text)',
		min = 1,
		max = 3,
		tooltip = '',
	}: {
		label: string;
		value?: number;
		color?: string;
		min?: number;
		max?: number;
		/** Tooltip text shown on hover */
		tooltip?: string;
	} = $props();
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
		onblur={() => { value = Math.min(max, Math.max(min, value || min)); }}
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
		font-size: 0.95rem;
		font-weight: 700;
		width: 2.5rem;
		text-align: center;
		font-variant-numeric: tabular-nums;
		/* Match standard text field height: font-size 0.95rem + padding 5px top/bottom */
		padding: 5px 4px;
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
