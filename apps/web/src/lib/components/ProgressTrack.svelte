<script lang="ts">
	/**
	 * 10-box progress track (bonds, failures, vow progress, foe/expedition progress).
	 * Value is stored as total ticks (0–40) so it maps directly to the DB field.
	 *
	 * Each box fills proportionally to its tick count:
	 *   0 ticks → empty (0%)
	 *   1 tick  → 25% filled
	 *   2 ticks → 50% filled
	 *   3 ticks → 75% filled
	 *   4 ticks → 100% filled
	 *
	 * Clicking a box cycles its tick count 0 → 1 → 2 → 3 → 4 → 0.
	 *
	 * Pass `color` to override the default amber accent (e.g. foe nature colour,
	 * journey green, site blue). Danger boxes always use red regardless of `color`.
	 */
	import { boxTicks, cycleBox, progressText } from '$lib/character.js';

	let {
		label,
		value = $bindable(0),
		boxes = 10,
		dangerCount = 0,
		color = '',
		onchange,
	}: {
		label: string;
		value?: number;
		boxes?: number;
		/** Number of boxes (from the left) to tint red — 0 disables danger styling */
		dangerCount?: number;
		/** CSS colour string for the track fill. Defaults to var(--text-accent). */
		color?: string;
		onchange?: (oldVal: number, newVal: number) => void;
	} = $props();

	function cycleBoxTick(i: number) {
		const old  = value;
		const next = cycleBox(value, i);
		if (next !== old) { onchange?.(old, next); value = next; }
	}
</script>

<div class="progress-section" style={color ? `--track-color: ${color}` : ''}>
	{#if label}
		<div class="section-label">{label}</div>
	{/if}

	<div class="track-boxes">
		{#each Array(boxes) as _, i (i)}
			{@const ticks   = boxTicks(value, i)}
			{@const fillPct = `${ticks * 25}%`}
			{@const isDanger = dangerCount > 0 && i < dangerCount}
			<button
				class="track-box"
				class:danger={isDanger}
				onclick={() => cycleBoxTick(i)}
				style="--fill: {fillPct}"
				data-ticks={ticks}
				title="{ticks}/4 ticks"
				aria-label="Progress box {i + 1}: {ticks} of 4 ticks"
			></button>
		{/each}
		{#if label}
			<div class="track-readout">{progressText(value, boxes)}</div>
		{/if}
	</div>
</div>

<style>
	.progress-section {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}

	/* Keep section-label margin from doubling with parent gap */
	.progress-section :global(.section-label) {
		margin-bottom: 0;
	}

	.track-readout {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		color: var(--text-dimmer);
		white-space: nowrap;
		flex-shrink: 0;
		margin-left: 6px;
		align-self: center;
	}

	.track-boxes {
		display: flex;
		gap: 2px;
		align-items: center;
	}

	/* Square filled box — 22 × 22 px, matching btn-progress height */
	.track-box {
		width: 22px;
		height: 22px;
		max-width: 22px;
		aspect-ratio: 1;
		flex-shrink: 0;
		padding: 0;
		background: transparent;
		border: 1px solid color-mix(in srgb, var(--track-color, var(--text-accent)) 35%, transparent);
		border-radius: 2px;
		cursor: pointer;
		position: relative;
		overflow: hidden;
		transition: border-color 0.1s;
	}

	/* Fill bar — grows left-to-right based on tick count */
	.track-box::after {
		content: '';
		position: absolute;
		inset: 0 auto 0 0;
		width: var(--fill, 0%);
		background: color-mix(in srgb, var(--track-color, var(--text-accent)) 65%, transparent);
		transition: width 0.15s ease;
	}

	.track-box:hover {
		border-color: color-mix(in srgb, var(--track-color, var(--text-accent)) 70%, transparent);
	}

	/* Danger/menace boxes — red outline only, fill uses normal track-color */
	.track-box.danger {
		border-width: 2px;
		border-color: #ef4444;
	}
	.track-box.danger:hover {
		border-color: color-mix(in srgb, #ef4444 85%, white);
	}
</style>
