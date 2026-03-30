<script lang="ts">
	/**
	 * A resource tile for Health, Spirit, and Supply.
	 * Same visual style as StatControl (coloured border, tinted background, background icon)
	 * but rectangular — the value sits between − and + buttons on one row.
	 * Button style matches the progress-track buttons in GlobalContextBar.
	 */

	let {
		label,
		value = $bindable(0),
		color = 'var(--text)',
		min = 0,
		max = 5,
		incDisabled = false,
		icon = '',
		tooltip = '',
		onchange,
	}: {
		label:        string;
		value?:       number;
		color?:       string;
		min?:         number;
		max?:         number;
		/** Disable the + button (e.g. Wounded blocks Health increment). */
		incDisabled?: boolean;
		/** Raw SVG string for the background icon. */
		icon?:        string;
		tooltip?:     string;
		onchange?:    (oldVal: number, newVal: number) => void;
	} = $props();

	function decrement() {
		const next = Math.max(min, value - 1);
		if (next !== value) { onchange?.(value, next); value = next; }
	}

	function increment() {
		const next = Math.min(max, value + 1);
		if (next !== value) { onchange?.(value, next); value = next; }
	}
</script>

<div class="res-tile" style:--res-color={color} title={tooltip || undefined}>
	<!-- Background icon -->
	{#if icon}
		<div class="res-icon" aria-hidden="true">{@html icon}</div>
	{/if}

	<!-- Name at top -->
	<span class="res-name">{label}</span>

	<!-- Control row: − value + -->
	<div class="res-row">
		<button
			class="res-btn"
			onclick={decrement}
			disabled={value <= min}
			aria-label="Decrease {label}"
		>−</button>
		<span class="res-value" class:res-value--wide={value > 9}>{value}</span>
		<button
			class="res-btn"
			onclick={increment}
			disabled={value >= max || incDisabled}
			aria-label="Increase {label}"
		>+</button>
	</div>
</div>

<style>
	.res-tile {
		position:        relative;
		width:           80px;
		display:         flex;
		flex-direction:  column;
		align-items:     center;
		justify-content: space-between;
		padding:         5px 4px 5px;
		border-radius:   6px;
		border:          2px solid color-mix(in srgb, var(--res-color) 50%, transparent);
		background:      color-mix(in srgb, var(--res-color) 8%, var(--bg-card));
		overflow:        hidden;
		gap:             3px;
	}

	/* Background icon */
	.res-icon {
		position:        absolute;
		inset:           0;
		display:         flex;
		align-items:     flex-end;
		justify-content: center;
		opacity:         0.22;
		pointer-events:  none;
	}

	:global([data-theme="dark"]) .res-icon {
		opacity: 0.50;
	}

	.res-icon :global(svg) {
		width:  100%;
		height: 100%;
		fill:   var(--res-color);
		color:  var(--res-color);
	}

	/* Name at top */
	.res-name {
		font-family:    var(--font-ui);
		font-size:      0.55rem;
		font-weight:    900;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color:          var(--res-color);
		position:       relative;
		z-index:        1;
		line-height:    1;
	}

	/* Control row */
	.res-row {
		display:         flex;
		align-items:     center;
		justify-content: center;
		gap:             4px;
		position:        relative;
		z-index:         1;
		width:           100%;
	}

	/* Large value */
	.res-value {
		font-family:          var(--font-ui);
		font-size:            1.3rem;
		font-weight:          900;
		font-variant-numeric: tabular-nums;
		color:                var(--res-color);
		line-height:          1;
		min-width:            1.4ch;
		text-align:           center;
	}

	.res-value--wide {
		font-size: 1.0rem;
	}

	/* Same style as gc-prog-btn (progress track buttons) */
	.res-btn {
		display:         inline-flex;
		align-items:     center;
		justify-content: center;
		font-family:     var(--font-ui);
		font-size:       0.68rem;
		font-weight:     600;
		background:      transparent;
		border:          1px solid var(--border-mid);
		border-radius:   3px;
		padding:         0 6px;
		height:          22px;
		cursor:          pointer;
		color:           var(--text-muted);
		letter-spacing:  0.02em;
		transition:      background 0.12s, color 0.12s, border-color 0.12s;
		flex-shrink:     0;
	}

	.res-btn:hover:not(:disabled) {
		background:    color-mix(in srgb, var(--res-color) 15%, transparent);
		color:         var(--res-color);
		border-color:  var(--res-color);
	}

	.res-btn:disabled {
		opacity: 0.35;
		cursor:  not-allowed;
	}
</style>
