<script lang="ts">
	/**
	 * A stat tile with coloured background icon, stat name at top, and value at bottom.
	 * Used for Edge, Heart, Iron, Shadow, Wits.
	 * Stats rarely change so ± buttons have been intentionally omitted.
	 * Standard Ironsworn range: 1–3.
	 * Fires onchange(oldVal, newVal) on blur when the value actually changed.
	 */

	import brainSvg  from '$icons/brain.svg?raw';
	import fistSvg   from '$icons/fist.svg?raw';
	import shadowSvg from '$icons/shadow.svg?raw';
	import swordSvg  from '$icons/sword-solid-full.svg?raw';
	import heartSvg  from '$icons/icon-heart.svg?raw';

	const STAT_ICONS: Record<string, string> = {
		Edge:   swordSvg,
		Heart:  heartSvg,
		Iron:   fistSvg,
		Shadow: shadowSvg,
		Wits:   brainSvg,
	};

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

	const icon = $derived(STAT_ICONS[label] ?? '');
</script>

<div class="stat-tile" style:--stat-color={color} title={tooltip || undefined}>
	<div class="stat-icon" aria-hidden="true">{@html icon}</div>
	<div class="stat-name">{label}</div>
	<input
		type="number"
		class="stat-value-input"
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
	.stat-tile {
		position:        relative;
		width:           52px;
		height:          52px;
		display:         flex;
		flex-direction:  column;
		align-items:     center;
		justify-content: space-between;
		padding:         5px 4px 4px;
		border-radius:   6px;
		border:          2px solid color-mix(in srgb, var(--stat-color) 50%, transparent);
		background:      color-mix(in srgb, var(--stat-color) 8%, var(--bg-card));
		overflow:        hidden;
		cursor:          default;
		transition:      border-color 0.15s, background 0.15s;
	}

	.stat-tile:has(.stat-value-input:focus) {
		border-color: var(--stat-color);
		box-shadow:   0 0 0 2px color-mix(in srgb, var(--stat-color) 25%, transparent);
	}

	/* Background icon — aligned to bottom */
	.stat-icon {
		position:        absolute;
		inset:           0;
		display:         flex;
		align-items:     flex-end;
		justify-content: center;
		opacity:         0.18;
		pointer-events:  none;
	}

	.stat-icon :global(svg) {
		width:  72%;
		height: 72%;
		fill:   var(--stat-color);
		color:  var(--stat-color);
	}

	/* Stat name at top */
	.stat-name {
		font-family:    var(--font-ui);
		font-size:      0.55rem;
		font-weight:    900;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color:          var(--stat-color);
		position:       relative;
		z-index:        1;
		line-height:    1;
	}

	/* Value input at bottom */
	.stat-value-input {
		font-family:         var(--font-ui);
		font-size:           1.3rem;
		font-weight:         700;
		font-variant-numeric: tabular-nums;
		width:               100%;
		text-align:          center;
		padding:             0;
		border:              none;
		background:          transparent;
		color:               var(--stat-color);
		-webkit-text-stroke: 1px white;
		text-stroke:         1px white;
		position:            relative;
		z-index:             1;
		line-height:         1;
		/* Hide browser number input spinners */
		-moz-appearance: textfield;
		appearance:      textfield;
	}

	.stat-value-input:focus {
		outline: none;
	}

	.stat-value-input::-webkit-outer-spin-button,
	.stat-value-input::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}
</style>
