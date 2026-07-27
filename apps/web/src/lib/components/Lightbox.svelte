<script lang="ts">
	/**
	 * Lightbox — modal overlay for an enlarged single image.
	 *
	 * Sized to fit-the-viewport: image scales until either 80vw or 80vh is hit
	 * (whichever comes first), preserving aspect ratio. Close via the corner
	 * button, the backdrop, or Escape.
	 *
	 * Usage:
	 *   <Lightbox src="/foes/wolf.webp" alt="Wolf" onclose={() => open = false} />
	 *
	 * bits-ui Dialog under the hood — Portal + Overlay + Content. Backdrop
	 * click closes via Overlay's click handler; Escape via Dialog.Root's
	 * onOpenChange.
	 */
	import { tooltip } from '$lib/actions/tooltip.js';
	import { Dialog } from 'bits-ui';

	let {
		src,
		alt = '',
		onclose,
	}: {
		src: string;
		alt?: string;
		onclose: () => void;
	} = $props();

	// bits-ui expects a bound `open` state; parent gates render with `{#if open}`
	// so we simply seed to `true` and route any close (Escape, backdrop) back
	// through `onclose`.
	let dialogOpen = $state(true);
</script>

<Dialog.Root
	bind:open={dialogOpen}
	onOpenChange={(next) => {
		if (!next) onclose();
	}}
>
	<Dialog.Portal>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<Dialog.Overlay class="lb-overlay" onclick={onclose} />
		<Dialog.Content class="lightbox">
			<img class="lb-img" {src} {alt} />
			<button
				type="button"
				class="lb-close"
				onclick={onclose}
				use:tooltip={'Close'}
				aria-label="Close">✕</button
			>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	/* bits-ui portals Content + Overlay to <body>, so scope every rule
	   globally — Svelte's CSS pruning can't see through the portal. */
	:global(.lb-overlay) {
		position: fixed;
		inset: 0;
		background: #000000c0;
		backdrop-filter: blur(2px);
		z-index: 80;
	}
	:global(.lightbox) {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: transparent;
		outline: none;
		z-index: 81;
	}

	:global(.lb-img) {
		display: block;
		max-width: 80vw;
		max-height: 80vh;
		width: auto;
		height: auto;
		object-fit: contain;
		border-radius: 6px;
		box-shadow: 0 18px 60px #00000080;
	}

	:global(.lb-close) {
		position: absolute;
		top: -14px;
		right: -14px;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		border: 1px solid var(--border-mid);
		background: var(--bg-card);
		color: var(--text);
		font-size: 1rem;
		line-height: 1;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 4px 14px #00000080;
		transition:
			background 0.12s,
			color 0.12s,
			border-color 0.12s;
	}
	:global(.lb-close:hover) {
		background: var(--bg-hover);
		color: var(--text-accent);
		border-color: var(--text-accent);
	}
	:global(.lb-close:focus-visible) {
		outline: 2px solid var(--text-accent);
		outline-offset: 2px;
	}
</style>
