<script lang="ts">
	/**
	 * DialogHeader — the standard draggable dialog title bar.
	 *
	 * Renders: drag-grip ⠿ → title (flex:1) → optional trailing content
	 * (a standard ✕ close button via `onclose`, or a custom `trailing`
	 * snippet — e.g. a category badge). Apply to the header slot of any
	 * <dialog>. The `draggable` action does `closest('dialog')` internally
	 * and no-ops when not inside one, so this is safe for inline-capable
	 * hosts too.
	 *
	 * This is the single source of truth for the pattern documented in
	 * CLAUDE.md "Standard dialog title bar style" — previously copy-pasted
	 * into every dialog (od-/md-/dd-/sd-/nd-/bg-/dice-/picker-/cm- headers).
	 *
	 * Two-view dialogs (list → detail) render one DialogHeader per view and
	 * pass `detail` on the detail view so the dynamic title ellipsizes.
	 */
	import type { Snippet } from 'svelte';
	import { draggable } from '$lib/actions/draggable.js';

	let {
		title,
		onclose,
		detail = false,
		radius = '10px 10px 0 0',
		trailing,
		leading,
	}: {
		/** Title text. Callers apply headingText() themselves for static labels. */
		title: string;
		/** When set, renders the standard ✕ close button. Ignored if `trailing` is given. */
		onclose?: () => void;
		/** Detail-view styling: smaller, ellipsized title for dynamic names. */
		detail?: boolean;
		/** Top corners' border-radius; match the host dialog (default 10px). */
		radius?: string;
		/** Custom trailing content rendered after the title instead of a close button. */
		trailing?: Snippet;
		/** Optional content rendered between the grip and the title — e.g. a small
		 *  leading glyph next to the name (matches the asset card's name icon). */
		leading?: Snippet;
	} = $props();
</script>

<div class="dh-header" class:dh-header--detail={detail} style:border-radius={radius} use:draggable>
	<span class="drag-grip" aria-hidden="true">⠿</span>
	{#if leading}{@render leading()}{/if}
	<span class="dh-title" class:dh-title--detail={detail}>{title}</span>
	{#if trailing}
		{@render trailing()}
	{:else if onclose}
		<button class="dh-close" onclick={onclose} aria-label="Close">✕</button>
	{/if}
</div>

<style>
	.dh-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-control);
		flex-shrink: 0;
	}
	.dh-header--detail {
		flex-wrap: nowrap;
	}
	.dh-title {
		font-family: var(--font-display);
		font-size: calc(0.78rem * var(--font-display-scale));
		font-weight: var(--font-display-weight);
		font-variant: var(--font-display-variant);
		letter-spacing: 0.08em;
		text-transform: var(--font-display-transform);
		color: var(--text-accent);
		flex: 1;
		min-width: 0;
	}
	.dh-title--detail {
		font-size: 0.72rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.dh-close {
		background: transparent;
		border: none;
		color: var(--text-dimmer);
		cursor: pointer;
		font-size: 0.9rem;
		padding: 2px 5px;
		border-radius: 3px;
		line-height: 1;
		font-family: inherit;
		flex-shrink: 0;
	}
	.dh-close:hover {
		color: var(--text);
	}
</style>
