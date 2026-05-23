<script lang="ts">
	/**
	 * 170×170 portrait uploader that floats right so adjacent prose wraps
	 * around it. Shared by characters, expeditions, communities, and NPCs.
	 *
	 * Click the image to open a file picker; the chosen file is centred-
	 * cropped and downscaled to a 256-pixel-square JPEG via cropImageFile.
	 * A small "✕" appears when a picture is present and clears it.
	 *
	 * Supports both binding styles:
	 *   • `bind:value={...}` — direct two-way binding.
	 *   • `value={...} oninput={fn}` — for parents whose data lives in a
	 *     state store updated through an explicit callback.
	 */
	import { cropImageFile } from '$lib/imageCrop.js';
	import { tooltip } from '$lib/actions/tooltip.js';

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
	<label class="pu-label" use:tooltip={'Click to change portrait'}>
		{#if value}
			<img class="pu-img" src={value} {alt} />
		{:else}
			<div class="pu-img pu-img--placeholder" aria-hidden="true">{@html placeholderSvg}</div>
		{/if}
		<input
			type="file"
			accept="image/*"
			class="pu-input"
			onchange={onFile}
			aria-label="Upload portrait"
		/>
	</label>
	{#if value}
		<button
			type="button"
			class="pu-clear"
			onclick={clear}
			use:tooltip={'Clear portrait'}
			aria-label="Clear portrait"
		>✕</button>
	{/if}
</div>

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
	}
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
		font-size:       0.7rem;
		line-height:     1;
		cursor:          pointer;
		transition:      background 0.12s;
	}
	.pu-clear:hover { background: rgba(0,0,0,0.8); }
</style>
