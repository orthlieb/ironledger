<script lang="ts">
	/**
	 * Momentum tile — single bordered tile matching ResourceTile height.
	 * Left column: MOMENTUM label + background icon + − value + controls.
	 * Right column (divided by hairline): ↺ Reset: n button + MAX: m display.
	 */
	import momentumSvg from '$icons/icon-momentum.svg?raw';

	let {
		value      = $bindable(0),
		resetVal   = 2,
		maxVal     = 10,
		onchange,
		onreset,
	}: {
		value?:    number;
		resetVal?: number;
		maxVal?:   number;
		onchange?: (oldVal: number, newVal: number) => void;
		onreset?:  () => void;
	} = $props();

	const COLOR = 'var(--color-momentum)';

	function decrement() {
		const next = Math.max(-6, value - 1);
		if (next !== value) { onchange?.(value, next); value = next; }
	}

	function increment() {
		const next = Math.min(maxVal, value + 1);
		if (next !== value) { onchange?.(value, next); value = next; }
	}
</script>

<div class="mt-tile" style:--mt-color={COLOR}>
	<!-- Background icon behind the left column -->
	<div class="mt-icon" aria-hidden="true">{@html momentumSvg}</div>

	<!-- Left: name + controls -->
	<div class="mt-left">
		<span class="mt-name">Momentum</span>
		<div class="mt-row">
			<button
				class="mt-btn"
				onclick={decrement}
				disabled={value <= -6}
				aria-label="Decrease Momentum"
			>−</button>
			<span class="mt-val" class:negative={value < 0}>{value}</span>
			<button
				class="mt-btn"
				onclick={increment}
				disabled={value >= maxVal}
				aria-label="Increase Momentum"
			>+</button>
		</div>
	</div>

	<!-- Divider -->
	<div class="mt-divider"></div>

	<!-- Right: Reset button + MAX -->
	<div class="mt-right">
		<button
			class="mt-reset-btn"
			onclick={onreset}
			title="Reset momentum to {resetVal}"
			aria-label="Reset momentum to {resetVal}"
		>↺ Reset: {resetVal}</button>
		<span class="mt-max">MAX: {maxVal}</span>
	</div>
</div>

<style>
	.mt-tile {
		position:        relative;
		display:         flex;
		flex-direction:  row;
		align-items:     stretch;
		padding:         5px 4px 5px;
		border-radius:   6px;
		border:          2px solid color-mix(in srgb, var(--mt-color) 50%, transparent);
		background:      color-mix(in srgb, var(--mt-color) 8%, var(--bg-card));
		overflow:        hidden;
		gap:             0;
	}

	/* Background icon — sits behind left column */
	.mt-icon {
		position:        absolute;
		top:             0;
		bottom:          0;
		left:            0;
		width:           90px;
		display:         flex;
		align-items:     center;
		justify-content: center;
		opacity:         0.12;
		pointer-events:  none;
	}

	:global([data-theme="dark"]) .mt-icon {
		opacity: 0.25;
	}

	.mt-icon :global(svg) {
		width:  60%;
		height: 60%;
		fill:   var(--mt-color);
		color:  var(--mt-color);
	}

	/* Left column: name + − value + */
	.mt-left {
		display:         flex;
		flex-direction:  column;
		align-items:     center;
		justify-content: space-between;
		gap:             3px;
		width:           80px;
		position:        relative;
		z-index:         1;
		padding:         0 2px;
	}

	.mt-name {
		font-family:    var(--font-ui);
		font-size:      0.55rem;
		font-weight:    900;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color:          var(--mt-color);
		line-height:    1;
	}

	.mt-row {
		display:         flex;
		align-items:     center;
		justify-content: center;
		gap:             4px;
		width:           100%;
	}

	.mt-val {
		font-family:          var(--font-ui);
		font-size:            1.3rem;
		font-weight:          900;
		font-variant-numeric: tabular-nums;
		color:                var(--mt-color);
		line-height:          1;
		min-width:            1.8ch;
		text-align:           center;
	}

	.mt-val.negative {
		color: var(--color-danger);
	}

	.mt-btn {
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
		transition:      background 0.12s, color 0.12s, border-color 0.12s;
		flex-shrink:     0;
	}

	.mt-btn:hover:not(:disabled) {
		background:   color-mix(in srgb, var(--mt-color) 15%, transparent);
		color:        var(--mt-color);
		border-color: var(--mt-color);
	}

	.mt-btn:disabled {
		opacity: 0.35;
		cursor:  not-allowed;
	}

	/* Hairline divider */
	.mt-divider {
		width:      1px;
		margin:     0 6px;
		background: color-mix(in srgb, var(--mt-color) 30%, transparent);
		flex-shrink: 0;
	}

	/* Right column: Reset button + MAX */
	.mt-right {
		display:         flex;
		flex-direction:  column;
		align-items:     stretch;
		justify-content: space-between;
		gap:             4px;
		position:        relative;
		z-index:         1;
		min-width:       60px;
	}

	.mt-reset-btn {
		font-family:    var(--font-ui);
		font-size:      0.6rem;
		font-weight:    700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color:          var(--mt-color);
		background:     transparent;
		border:         1px solid color-mix(in srgb, var(--mt-color) 40%, transparent);
		border-radius:  4px;
		padding:        3px 5px;
		cursor:         pointer;
		white-space:    nowrap;
		transition:     background 0.12s, border-color 0.12s;
		text-align:     center;
		flex:           1;
	}

	.mt-reset-btn:hover {
		background:   color-mix(in srgb, var(--mt-color) 15%, transparent);
		border-color: var(--mt-color);
	}

	.mt-max {
		font-family:    var(--font-ui);
		font-size:      0.6rem;
		font-weight:    700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color:          var(--mt-color);
		text-align:     center;
		flex:           1;
		display:        flex;
		align-items:    center;
		justify-content: center;
	}
</style>
