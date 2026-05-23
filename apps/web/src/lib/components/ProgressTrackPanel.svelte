<script lang="ts">
	/**
	 * Standard progress-track panel — wraps ProgressTrack with the
	 * "foe-pattern" layout: a label row (title + tally) above a controls
	 * row (boxes + ± buttons). align-self:flex-start shrinks the group to
	 * the controls width so the tally always sits flush with the + button.
	 *
	 *   ┌────────────────────────────────────────┐
	 *   │ TITLE              n/10 boxes, k/4 ticks │
	 *   │ ▣▣▣▣▣▣▣▣▣▣  [−step] [+step]            │
	 *   └────────────────────────────────────────┘
	 */
	import ProgressTrack from './ProgressTrack.svelte';
	import { progressText } from '$lib/character.js';
	import { tooltip } from '$lib/actions/tooltip.js';

	let {
		value = $bindable(0),
		label,
		color = '',
		step = 1,
		showStep = false,
		min = 0,
		max = 40,
		boxes = 10,
		dangerCount = 0,
		onchange,
	}: {
		value?: number;
		/** Section heading shown at top-left of the label row. */
		label: string;
		/** Optional CSS colour string for the track fill. */
		color?: string;
		/** Ticks the ± buttons add/remove per click (default 1). */
		step?: number;
		/** If true, render the step on the buttons (e.g. "+8", "−8"). */
		showStep?: boolean;
		min?: number;
		max?: number;
		boxes?: number;
		/** Left-most boxes tinted red (e.g. vow menace). */
		dangerCount?: number;
		onchange?: (oldVal: number, newVal: number) => void;
	} = $props();

	function fire(next: number) {
		if (next === value) return;
		const old = value;
		value = next;
		onchange?.(old, next);
	}
	function unmark() { fire(Math.max(min, value - step)); }
	function mark()   { fire(Math.min(max, value + step)); }

	const tally       = $derived(progressText(value, boxes));
	const minusLabel  = $derived(showStep ? `−${step}` : '−');
	const plusLabel   = $derived(showStep ? `+${step}` : '+');
	const minusTitle  = $derived(showStep ? `Unmark progress (−${step} ticks)` : 'Decrease');
	const plusTitle   = $derived(showStep ? `Mark progress (+${step} ticks)`   : 'Increase');
</script>

<div class="ptp-group">
	<div class="ptp-label-row">
		<span class="ptp-label">{label}</span>
		<span class="ptp-tally">{tally}</span>
	</div>
	<div class="ptp-controls">
		<ProgressTrack
			label=""
			bind:value
			{color}
			{boxes}
			{dangerCount}
			onchange={(o, n) => onchange?.(o, n)}
		/>
		<div class="ptp-btns">
			<button class="ptp-btn" onclick={unmark} disabled={value <= min} use:tooltip={minusTitle} aria-label={minusTitle}>{minusLabel}</button>
			<button class="ptp-btn" onclick={mark}   disabled={value >= max} use:tooltip={plusTitle}  aria-label={plusTitle}>{plusLabel}</button>
		</div>
	</div>
</div>

<style>
	.ptp-group {
		display:        flex;
		flex-direction: column;
		gap:            6px;
		align-self:     flex-start;
	}
	.ptp-label-row {
		display:         flex;
		justify-content: space-between;
		align-items:     baseline;
		gap:             8px;
	}
	.ptp-label {
		font-family:    var(--font-ui);
		font-size:      0.7rem;
		font-weight:    600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color:          var(--text-dimmer);
	}
	.ptp-tally {
		font-family:          var(--font-ui);
		font-size:            0.65rem;
		color:                var(--text-dimmer);
		font-variant-numeric: tabular-nums;
		white-space:          nowrap;
	}
	.ptp-controls {
		display:     flex;
		align-items: center;
		gap:         6px;
	}
	.ptp-btns {
		display:     flex;
		gap:         4px;
		flex-shrink: 0;
	}
	.ptp-btn {
		display:         inline-flex;
		align-items:     center;
		justify-content: center;
		height:          22px;
		padding:         0 7px;
		border:          1px solid var(--border-mid);
		border-radius:   3px;
		background:      transparent;
		color:           var(--text-muted);
		font-family:     var(--font-ui);
		font-size:       0.68rem;
		font-weight:     600;
		line-height:     1;
		white-space:     nowrap;
		cursor:          pointer;
		transition:      background 0.12s, color 0.12s;
	}
	.ptp-btn:hover:not(:disabled) {
		background: var(--bg-hover);
		color:      var(--text);
	}
	.ptp-btn:disabled {
		opacity: 0.35;
		cursor:  not-allowed;
	}
</style>
