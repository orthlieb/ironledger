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
	 *
	 * Each segment carries a draining-hourglass watermark (start → 75% → 25% →
	 * end across the row) — dimmed like the stat-tile icons, with the accent
	 * background filling in as segments are marked.
	 */
	import { tooltip } from '$lib/actions/tooltip.js';
	import hgStart from '$icons/hourglass-start.svg?raw';
	import hg75 from '$icons/hourglass-75.svg?raw';
	import hg25 from '$icons/hourglass-25.svg?raw';
	import hgEnd from '$icons/hourglass-end.svg?raw';

	/** Draining stages, one per segment (only used for the canonical 4-box track). */
	const HOURGLASS = [hgStart, hg75, hg25, hgEnd];

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
			>
				{#if HOURGLASS[i]}
					<span class="countdown-hg" aria-hidden="true">{@html HOURGLASS[i]}</span>
				{/if}
			</button>
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

	/* Hourglass watermark — dimmed like the stat-tile icons. Sits above the inset
	   border (z 1) and the fill so it reads in both empty and filled boxes. */
	.countdown-hg {
		position: absolute;
		inset: 0;
		z-index: 2;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
		color: var(--track-color, var(--text-accent));
		opacity: 0.3;
		transition:
			color 0.12s,
			opacity 0.12s;
	}
	.countdown-hg :global(svg) {
		width: 70%;
		height: 70%;
		fill: currentColor;
	}
	/* On a filled box the accent fills the background, so knock the glyph out in
	   the card colour (theme-aware) — dark hole in dark mode, light in light. */
	.countdown-box.filled .countdown-hg {
		color: var(--track-inner-bg, var(--bg-card));
		opacity: 0.8;
	}
</style>
