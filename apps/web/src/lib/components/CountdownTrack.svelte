<script lang="ts">
	/**
	 * Countdown track — a fixed row of whole-fill segments (default 4), used by
	 * Scene Challenges for the "running out of time" clock. Unlike ProgressTrack
	 * (which quarter-cycles each box in ticks), each segment here is simply
	 * filled or empty and clicks fill/unfill up to that segment:
	 *   click segment i → fill through i (filled = i + 1)
	 *   click the topmost filled segment again → unfill it (filled = i)
	 *
	 * `filled` is the number of filled segments (0..segments), bindable. Pass
	 * `color` to tint the fill (defaults to the accent).
	 */
	import { tooltip } from '$lib/actions/tooltip.js';

	let {
		label,
		filled = $bindable(0),
		segments = 4,
		color = '',
		onchange,
	}: {
		label?: string;
		filled?: number;
		segments?: number;
		/** CSS colour string for the fill. Defaults to var(--text-accent). */
		color?: string;
		onchange?: (oldVal: number, newVal: number) => void;
	} = $props();

	function clickSegment(i: number) {
		const old = filled;
		// Clicking the topmost filled segment clears it; otherwise fill through i.
		const next = filled === i + 1 ? i : i + 1;
		if (next !== old) {
			onchange?.(old, next);
			filled = next;
		}
	}
</script>

<div class="countdown-section" style={color ? `--track-color: ${color}` : ''}>
	{#if label}
		<div class="section-label">{label}</div>
	{/if}

	<div class="countdown-boxes">
		{#each Array(segments) as _, i (i)}
			<button
				class="countdown-box"
				class:filled={i < filled}
				onclick={() => clickSegment(i)}
				use:tooltip={`${filled}/${segments} filled`}
				aria-label="Countdown segment {i + 1} of {segments}: {i < filled ? 'filled' : 'empty'}"
			></button>
		{/each}
		{#if label}
			<div class="countdown-readout">{filled}/{segments}</div>
		{/if}
	</div>
</div>

<style>
	.countdown-section {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.countdown-section :global(.section-label) {
		margin-bottom: 0;
	}

	.countdown-readout {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		color: var(--text-dimmer);
		white-space: nowrap;
		flex-shrink: 0;
		margin-left: 6px;
		align-self: center;
	}

	.countdown-boxes {
		display: flex;
		gap: 2px;
		align-items: center;
	}

	/* Square segment — 22 × 22 px, matching the progress-track box size. */
	.countdown-box {
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
		transition:
			border-color 0.1s,
			background 0.12s;
	}
	/* Inner border so the fill reads as an inset block (matches ProgressTrack). */
	.countdown-box::before {
		content: '';
		position: absolute;
		inset: 0;
		border: 1px solid var(--track-inner-bg, var(--bg-card));
		border-radius: 1px;
		z-index: 1;
		pointer-events: none;
	}
	.countdown-box.filled {
		background: color-mix(in srgb, var(--track-color, var(--text-accent)) 65%, transparent);
	}
	.countdown-box:hover {
		border-color: color-mix(in srgb, var(--track-color, var(--text-accent)) 70%, transparent);
	}
</style>
