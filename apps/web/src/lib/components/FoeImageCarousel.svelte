<script lang="ts">
	/**
	 * FoeImageCarousel — displays a foe portrait with prev/next arrows that
	 * cycle through any numbered alternates in static/foes/ (e.g. bear.webp,
	 * bear-2.webp, bear-3.webp). Arrows + counter only appear when more
	 * than one image exists.
	 *
	 * Drops into any spot that used to show a single <img>. Example:
	 *
	 *   <FoeImageCarousel name={foe.name} alt={foe.name} class="fc-portrait" />
	 *
	 * Keyboard: ArrowLeft / ArrowRight cycle when the component has focus.
	 */

	import { foePortraitUrl, discoverFoePortraitCount, UNKNOWN_FOE_PORTRAIT } from '$lib/foePortrait.js';

	interface Props {
		name: string;
		alt?: string;
		class?: string;
		/** Show a small "n / m" counter overlay. Defaults to true when multiple. */
		showCounter?: boolean;
	}

	let { name, alt, class: className = '', showCounter = true }: Props = $props();

	let index = $state(0);
	let count = $state(1);   // we always assume the primary exists

	$effect(() => {
		// Kick off discovery when the name changes; ignore until resolved.
		const currentName = name;
		index = 0;
		count = 1;
		discoverFoePortraitCount(currentName).then((n) => {
			if (currentName === name) count = n;
		});
	});

	function prev(e: Event) {
		e.stopPropagation();
		if (count <= 1) return;
		index = (index - 1 + count) % count;
	}

	function next(e: Event) {
		e.stopPropagation();
		if (count <= 1) return;
		index = (index + 1) % count;
	}

	function onKey(e: KeyboardEvent) {
		if (count <= 1) return;
		if (e.key === 'ArrowLeft')  { prev(e); e.preventDefault(); }
		if (e.key === 'ArrowRight') { next(e); e.preventDefault(); }
	}

	let src = $derived(foePortraitUrl(name, index));
	let hasMultiple = $derived(count > 1);
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="foe-carousel {className}"
	tabindex={hasMultiple ? 0 : -1}
	onkeydown={onKey}
	role="group"
	aria-label={alt ? `${alt} — image ${index + 1} of ${count}` : undefined}
>
	<img
		{src}
		alt={alt ?? ''}
		draggable="false"
		onerror={(e) => { (e.currentTarget as HTMLImageElement).src = UNKNOWN_FOE_PORTRAIT; }}
	/>

	{#if hasMultiple}
		<button
			type="button"
			class="foe-carousel-arrow foe-carousel-arrow--prev"
			onclick={prev}
			aria-label="Previous image"
		>‹</button>
		<button
			type="button"
			class="foe-carousel-arrow foe-carousel-arrow--next"
			onclick={next}
			aria-label="Next image"
		>›</button>

		{#if showCounter}
			<span class="foe-carousel-counter" aria-hidden="true">{index + 1} / {count}</span>
		{/if}
	{/if}
</div>

<style>
	.foe-carousel {
		position: relative;
		display: block;
		line-height: 0;
		/* Honour consumer-supplied border-radius so the inner img is clipped
		   to match. Callers apply radius to the class passed in `class="…"`,
		   which lands on the outer div. */
		overflow: hidden;
	}
	.foe-carousel img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.foe-carousel-arrow {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 32px;
		height: 48px;
		border: none;
		background: rgba(0, 0, 0, 0.45);
		color: #fff;
		font-size: 1.6rem;
		line-height: 1;
		cursor: pointer;
		padding: 0;
		border-radius: 4px;
		opacity: 0;
		transition: opacity 0.15s, background 0.15s;
		user-select: none;
	}
	.foe-carousel:hover .foe-carousel-arrow,
	.foe-carousel:focus-within .foe-carousel-arrow {
		opacity: 1;
	}
	.foe-carousel-arrow:hover {
		background: rgba(0, 0, 0, 0.7);
	}
	.foe-carousel-arrow:focus-visible {
		opacity: 1;
		outline: 2px solid var(--text-accent);
		outline-offset: 2px;
	}

	.foe-carousel-arrow--prev { left: 6px; }
	.foe-carousel-arrow--next { right: 6px; }

	.foe-carousel-counter {
		position: absolute;
		bottom: 6px;
		right: 8px;
		padding: 2px 7px;
		border-radius: 10px;
		background: rgba(0, 0, 0, 0.55);
		color: #fff;
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		pointer-events: none;
	}
</style>
