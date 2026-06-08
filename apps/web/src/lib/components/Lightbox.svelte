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
	 * Renders nothing on its own — the parent gates with {#if open}. Native
	 * <dialog> in the top layer, so it sits above any other dialog or modal
	 * (per CLAUDE.md app-level scroll architecture).
	 */
	import { tooltip } from '$lib/actions/tooltip.js';

	let {
		src,
		alt = '',
		onclose,
	}: {
		src: string;
		alt?: string;
		onclose: () => void;
	} = $props();

	let dialogEl = $state<HTMLDialogElement | null>(null);
	$effect(() => {
		if (dialogEl) dialogEl.showModal();
	});

	// Click on the backdrop (outside the image) closes. The image itself
	// stops propagation so taps on it don't dismiss accidentally.
	function onBackdropClick(e: MouseEvent) {
		if (e.target === dialogEl) onclose();
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dialogEl} class="lightbox" oncancel={onclose} onclick={onBackdropClick}>
	<img class="lb-img" {src} {alt} onclick={(e) => e.stopPropagation()} />
	<button type="button" class="lb-close" onclick={onclose} use:tooltip={'Close'} aria-label="Close"
		>✕</button
	>
</dialog>

<style>
	/* Per CLAUDE.md iOS Safari rules:
	   - center via top/left + transform (never inset:0 + margin:auto)
	   - sizing in vh/vw, never dvh
	   - no display:flex chain that collapses to 0 */
	.lightbox {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		margin: 0;
		padding: 0;
		border: none;
		background: transparent;
		overflow: visible;
		overscroll-behavior: contain;
		max-width: none;
		max-height: none;
	}
	.lightbox::backdrop {
		background: #000000c0;
		backdrop-filter: blur(2px);
	}

	.lb-img {
		display: block;
		max-width: 80vw;
		max-height: 80vh;
		width: auto;
		height: auto;
		object-fit: contain;
		border-radius: 6px;
		box-shadow: 0 18px 60px #00000080;
	}

	.lb-close {
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
	.lb-close:hover {
		background: var(--bg-hover);
		color: var(--text-accent);
		border-color: var(--text-accent);
	}
	.lb-close:focus-visible {
		outline: 2px solid var(--text-accent);
		outline-offset: 2px;
	}
</style>
