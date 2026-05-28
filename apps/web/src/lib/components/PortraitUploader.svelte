<script lang="ts">
	/**
	 * 170×170 portrait uploader that floats right so adjacent prose wraps
	 * around it. Shared by characters, expeditions, communities, and NPCs.
	 *
	 *   • Empty (placeholder)  → click opens a file picker; the chosen file
	 *     is centred-cropped and downscaled to a 256-pixel JPEG via
	 *     cropImageFile.
	 *   • Filled (real image)  → click opens a Lightbox showing the
	 *     enlarged image (80vw / 80vh, whichever hits first).
	 *   • A trash button (top-right corner of the image) clears the
	 *     portrait, returning to the placeholder state.
	 *
	 * To change a portrait, click the trash first, then click the
	 * placeholder.
	 *
	 * Supports both binding styles:
	 *   • `bind:value={...}` — direct two-way binding.
	 *   • `value={...} oninput={fn}` — for parents whose data lives in a
	 *     state store updated through an explicit callback.
	 */
	import { cropImageFile } from '$lib/imageCrop.js';
	import { tooltip } from '$lib/actions/tooltip.js';
	import Lightbox from '$lib/components/Lightbox.svelte';
	import trashSvg from '$icons/trash-solid-full.svg?raw';

	let {
		value = $bindable(''),
		placeholderSvg,
		alt = '',
		oninput,
	}: {
		/** Current portrait as a JPEG data URL (or empty string). */
		value?: string;
		/** Raw SVG markup shown when no portrait is set. */
		placeholderSvg: string;
		alt?: string;
		/** Called after a successful crop with the new data URL.
		 *  Use this when `value` lives in nested state. Passing '' indicates
		 *  the user clicked the clear button. */
		oninput?: (newValue: string) => void;
	} = $props();

	let lightboxOpen = $state(false);

	async function onFile(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			const dataUrl = await cropImageFile(file);
			value = dataUrl;
			oninput?.(dataUrl);
		} catch (err) {
			console.error('[PortraitUploader] crop failed', err);
		}
	}

	function clear() {
		value = '';
		oninput?.('');
	}
</script>

<div class="pu-wrap">
	{#if value}
		<!-- Filled state: image is a button that opens the lightbox. -->
		<button
			type="button"
			class="pu-label pu-label--view"
			onclick={() => (lightboxOpen = true)}
			use:tooltip={'Click to enlarge'}
			aria-label="View enlarged portrait"
		>
			<img class="pu-img" src={value} {alt} />
		</button>
		<button
			type="button"
			class="pu-clear"
			onclick={clear}
			use:tooltip={'Delete portrait'}
			aria-label="Delete portrait"
		>{@html trashSvg}</button>
	{:else}
		<!-- Empty state: label wraps the hidden file input; click opens it. -->
		<label class="pu-label" use:tooltip={'Click to upload portrait'}>
			<div class="pu-img pu-img--placeholder" aria-hidden="true">{@html placeholderSvg}</div>
			<input
				type="file"
				accept="image/*"
				class="pu-input"
				onchange={onFile}
				aria-label="Upload portrait"
			/>
		</label>
	{/if}
</div>

{#if lightboxOpen && value}
	<Lightbox src={value} {alt} onclose={() => (lightboxOpen = false)} />
{/if}

<style>
	.pu-wrap {
		position:      relative;
		float:         right;
		margin:        0 0 10px 14px;
		shape-outside: margin-box;
	}
	.pu-label {
		display: block;
		cursor:  pointer;
		padding: 0;
		border:  none;
		background: transparent;
	}
	.pu-label--view { cursor: zoom-in; }
	.pu-img {
		display:       block;
		width:         170px;
		height:        170px;
		max-height:    240px;
		object-fit:    cover;
		border:        1px solid var(--border);
		border-radius: 6px;
		opacity:       0.95;
		transition:    opacity 0.12s;
	}
	.pu-label:hover .pu-img { opacity: 0.75; }
	.pu-img--placeholder {
		background:      var(--bg-inset);
		display:         flex;
		align-items:     center;
		justify-content: center;
		color:           var(--text-dimmer);
	}
	.pu-img--placeholder :global(svg) {
		width:  60%;
		height: 60%;
		fill:   var(--text-dimmer);
	}
	.pu-input {
		position: absolute;
		left:     -9999px;
		width:    1px;
		height:   1px;
	}
	.pu-clear {
		position:        absolute;
		top:             4px;
		right:           4px;
		z-index:         2;
		width:           22px;
		height:          22px;
		display:         flex;
		align-items:     center;
		justify-content: center;
		padding:         0;
		border:          none;
		border-radius:   50%;
		background:      rgba(0,0,0,0.55);
		color:           #fff;
		line-height:     1;
		cursor:          pointer;
		opacity:         0;
		transition:      background 0.12s, opacity 0.12s;
	}
	/* Reveal the trash button only while hovering the portrait (or when it
	   gains keyboard focus). On touch devices there's no hover, so keep it
	   visible there. */
	.pu-wrap:hover .pu-clear,
	.pu-clear:focus-visible {
		opacity: 1;
	}
	@media (hover: none) {
		.pu-clear { opacity: 1; }
	}
	.pu-clear :global(svg) {
		width:  12px;
		height: 12px;
		fill:   currentColor;
	}
	.pu-clear:hover { background: rgba(0,0,0,0.8); }
</style>
