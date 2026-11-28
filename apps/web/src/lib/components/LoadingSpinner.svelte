<script lang="ts">
	/**
	 * LoadingSpinner — what the app shows while it waits: the livery's brand
	 * mark (the axe, a hat, a pumpkin…; the axe when a livery ships none),
	 * turning, with an optional label under it.
	 *
	 * It fades in after a moment, so a load that's over quickly never shows
	 * it. With reduced motion it pulses instead of turning. role="status"
	 * tells a screen reader what's loading.
	 *
	 * Props: `label` (shown, and read out; "Loading" when left out, read out
	 * only), `size` (the mark's height in px, default 56), `inline` (beside
	 * its label rather than above it, for a line of text).
	 */
	import axeSvg from '#icons/sharp-axe.svg?raw';
	import { activeLiveryBrand } from '#lib/fontStore.svelte.js';

	let {
		label = '',
		size = 56,
		inline = false,
	}: { label?: string; size?: number; inline?: boolean } = $props();
</script>

<div class="ls" class:ls--inline={inline} role="status" style="--ls-size: {size}px">
	<span class="ls-icon" aria-hidden="true">{@html activeLiveryBrand() ?? axeSvg}</span>
	{#if label}
		<span class="ls-label">{label}</span>
	{:else}
		<span class="ls-sr">Loading</span>
	{/if}
</div>

<style>
	.ls {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		color: var(--text-accent);
		opacity: 0;
		animation: ls-appear 0.2s ease-out 0.15s forwards;
	}
	.ls--inline {
		flex-direction: row;
		justify-content: flex-start;
	}
	.ls-icon {
		display: flex;
		line-height: 0;
		animation: ls-turn 1.4s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite;
	}
	/* Height parity across the axe and the liveries' marks, whose
	   viewBoxes hug the glyph (aspect ratios vary), as the nav mark does. */
	.ls-icon :global(svg) {
		height: var(--ls-size);
		width: auto;
		max-width: calc(var(--ls-size) * 1.5);
		fill: currentColor;
	}
	.ls-label {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text-muted);
	}
	.ls-sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	@keyframes ls-appear {
		to {
			opacity: 1;
		}
	}
	@keyframes ls-turn {
		to {
			transform: rotate(360deg);
		}
	}
	@keyframes ls-pulse {
		50% {
			opacity: 0.35;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.ls-icon {
			animation: ls-pulse 1.6s ease-in-out infinite;
		}
	}
</style>
