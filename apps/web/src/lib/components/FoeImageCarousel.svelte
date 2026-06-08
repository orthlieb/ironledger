<script lang="ts">
	/**
	 * FoeImageCarousel — portrait with prev/next arrows that cycle through
	 * a foe's alternate portraits. Arrows + the dot indicator only appear
	 * when more than one image exists.
	 *
	 *   <FoeImageCarousel name={foe.name} images={foe.images} alt={foe.name} />
	 *
	 * Keyboard: ArrowLeft / ArrowRight cycle when the component has focus.
	 */

	import { foePortraitUrl, UNKNOWN_FOE_PORTRAIT } from '$lib/foePortrait.js';

	interface Props {
		name: string;
		images?: readonly string[];
		alt?: string;
		class?: string;
	}

	let { name, images, alt, class: className = '' }: Props = $props();

	let index = $state(0);

	// Reset the cursor to 0 whenever the parent swaps to a different foe or
	// the image list shape changes.
	$effect(() => {
		const _reset = name + (images?.length ?? 0);
		index = 0;
	});

	let count = $derived(images && images.length > 0 ? images.length : 1);
	let src = $derived(foePortraitUrl(name, images, index));
	let hasMultiple = $derived(count > 1);

	function prev(e: Event) {
		e.stopPropagation();
		if (!hasMultiple) return;
		index = (index - 1 + count) % count;
	}

	function next(e: Event) {
		e.stopPropagation();
		if (!hasMultiple) return;
		index = (index + 1) % count;
	}

	function goto(i: number, e: Event) {
		e.stopPropagation();
		if (i < 0 || i >= count) return;
		index = i;
	}

	function onKey(e: KeyboardEvent) {
		if (!hasMultiple) return;
		if (e.key === 'ArrowLeft') {
			prev(e);
			e.preventDefault();
		}
		if (e.key === 'ArrowRight') {
			next(e);
			e.preventDefault();
		}
	}
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
		onerror={(e) => {
			(e.currentTarget as HTMLImageElement).src = UNKNOWN_FOE_PORTRAIT;
		}}
	/>

	{#if hasMultiple}
		<button
			type="button"
			class="foe-carousel-arrow foe-carousel-arrow--prev"
			onclick={prev}
			aria-label="Previous image">‹</button
		>
		<button
			type="button"
			class="foe-carousel-arrow foe-carousel-arrow--next"
			onclick={next}
			aria-label="Next image">›</button
		>

		<!-- Dot indicator — one dot per image, centered at the bottom. Active
		     dot is opaque white; inactive are translucent. Clickable so the
		     user can jump directly. -->
		<div class="foe-carousel-dots">
			{#each { length: count } as _, i}
				<button
					type="button"
					class="foe-carousel-dot"
					class:is-active={i === index}
					onclick={(e) => goto(i, e)}
					aria-label={`Go to image ${i + 1}`}
					aria-current={i === index ? 'true' : undefined}
				></button>
			{/each}
		</div>
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
		transition:
			opacity 0.15s,
			background 0.15s;
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

	.foe-carousel-arrow--prev {
		left: 6px;
	}
	.foe-carousel-arrow--next {
		right: 6px;
	}

	/* Dot indicator — translucent capsule of circles, centered at the bottom. */
	.foe-carousel-dots {
		position: absolute;
		bottom: 8px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		gap: 6px;
		padding: 4px 8px;
		border-radius: 999px;
		background: rgba(0, 0, 0, 0.35);
		-webkit-backdrop-filter: blur(2px);
		backdrop-filter: blur(2px);
	}
	.foe-carousel-dot {
		width: 8px;
		height: 8px;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.35);
		cursor: pointer;
		transition:
			background 0.15s,
			transform 0.15s;
	}
	.foe-carousel-dot:hover {
		background: rgba(255, 255, 255, 0.6);
	}
	.foe-carousel-dot.is-active {
		background: rgba(255, 255, 255, 0.95);
		transform: scale(1.15);
	}
	.foe-carousel-dot:focus-visible {
		outline: 2px solid var(--text-accent);
		outline-offset: 2px;
	}
</style>
