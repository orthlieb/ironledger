<script lang="ts">
	/**
	 * 170×170 portrait uploader that floats right so adjacent prose wraps
	 * around it. Shared by characters, expeditions, communities, and NPCs.
	 *
	 * Portrait bytes live server-side in the content-addressed blob store, not
	 * inline in the entity JSON. This component talks to a per-entity portrait
	 * endpoint (`endpoint`, e.g. `/api/session/communities/<id>/portrait` or
	 * `/api/characters/<id>/portrait`) and the parent stores only a lightweight
	 * `etag` reference:
	 *
	 *   • Empty (placeholder)  → click opens a file picker; the chosen file is
	 *     centred-cropped/downscaled via cropImageFile, PUT to `endpoint`, and
	 *     the returned etag handed back through `oninput`.
	 *   • Filled (real image)  → rendered from `endpoint?v=<etag>` (cache-busted
	 *     by the content hash); click opens a Lightbox with the same source.
	 *   • A trash button clears the portrait (DELETE `endpoint`, then
	 *     `oninput('')`).
	 *
	 * After a successful upload the just-cropped data URL is shown immediately
	 * as a local preview so there's no flash waiting for the round-trip GET.
	 */
	import { cropImageFile } from '$lib/imageCrop.js';
	import { tooltip } from '$lib/actions/tooltip.js';
	import Lightbox from '$lib/components/Lightbox.svelte';
	import trashSvg from '$icons/trash-solid-full.svg?raw';

	let {
		endpoint,
		etag = '',
		placeholderSvg,
		alt = '',
		oninput,
	}: {
		/** Per-entity portrait resource URL (no query string). */
		endpoint: string;
		/** Current portrait content hash; '' when there is no portrait. */
		etag?: string;
		/** Raw SVG markup shown when no portrait is set. */
		placeholderSvg: string;
		alt?: string;
		/** Called after a successful upload (new etag) or clear (''). */
		oninput?: (newEtag: string) => void;
	} = $props();

	let lightboxOpen = $state(false);
	// Just-cropped data URL, shown immediately after an upload so the image
	// doesn't flash. Reset whenever the endpoint changes (different entity).
	let localPreview = $state('');
	let previewFor = ''; // the endpoint the current preview belongs to
	$effect(() => {
		// Drop the optimistic preview when the uploader switches to a different
		// entity, so a stale image never lingers. Reading `endpoint` in the guard
		// is what subscribes this effect to it.
		if (previewFor !== endpoint) {
			previewFor = endpoint;
			localPreview = '';
		}
	});

	// The image source: local preview wins right after upload, otherwise the
	// cache-busted endpoint URL. Empty when there's no portrait.
	const src = $derived(localPreview || (etag ? `${endpoint}?v=${encodeURIComponent(etag)}` : ''));

	async function onFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file || !endpoint) return;
		try {
			const dataUrl = await cropImageFile(file);
			localPreview = dataUrl; // optimistic — show it now
			const res = await fetch(endpoint, {
				method: 'PUT',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ dataUrl }),
			});
			if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
			const { etag: newEtag } = (await res.json()) as { etag: string };
			oninput?.(newEtag);
		} catch (err) {
			console.error('[PortraitUploader] upload failed', err);
			localPreview = ''; // revert so we don't show an unsaved image
		} finally {
			input.value = ''; // allow re-selecting the same file
		}
	}

	async function clear() {
		if (!endpoint) return;
		try {
			const res = await fetch(endpoint, { method: 'DELETE', credentials: 'include' });
			if (!res.ok && res.status !== 404) throw new Error(`Delete failed: ${res.status}`);
		} catch (err) {
			console.error('[PortraitUploader] clear failed', err);
		}
		localPreview = '';
		oninput?.('');
	}
</script>

<div class="pu-wrap">
	{#if src}
		<!-- Filled state: image is a button that opens the lightbox. -->
		<button
			type="button"
			class="pu-label pu-label--view"
			onclick={() => (lightboxOpen = true)}
			use:tooltip={'Click to enlarge'}
			aria-label="View enlarged portrait"
		>
			<img class="pu-img" {src} {alt} loading="lazy" />
		</button>
		<button
			type="button"
			class="pu-clear"
			onclick={clear}
			use:tooltip={'Delete portrait'}
			aria-label="Delete portrait">{@html trashSvg}</button
		>
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

{#if lightboxOpen && src}
	<Lightbox {src} {alt} onclose={() => (lightboxOpen = false)} />
{/if}

<style>
	.pu-wrap {
		position: relative;
		float: right;
		margin: 0 0 10px 14px;
		shape-outside: margin-box;
	}
	.pu-label {
		display: block;
		cursor: pointer;
		padding: 0;
		border: none;
		background: transparent;
	}
	.pu-label--view {
		cursor: zoom-in;
	}
	.pu-img {
		display: block;
		width: 170px;
		height: 170px;
		max-height: 240px;
		object-fit: cover;
		border: 1px solid var(--border);
		border-radius: 6px;
		opacity: 0.95;
		transition: opacity 0.12s;
	}
	.pu-label:hover .pu-img {
		opacity: 0.75;
	}
	.pu-img--placeholder {
		background: var(--bg-inset);
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-dimmer);
	}
	.pu-img--placeholder :global(svg) {
		width: 60%;
		height: 60%;
		fill: var(--text-dimmer);
	}
	.pu-input {
		position: absolute;
		left: -9999px;
		width: 1px;
		height: 1px;
	}
	.pu-clear {
		position: absolute;
		top: 4px;
		right: 4px;
		z-index: 2;
		width: 22px;
		height: 22px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.55);
		color: #fff;
		line-height: 1;
		cursor: pointer;
		opacity: 0;
		transition:
			background 0.12s,
			opacity 0.12s;
	}
	/* Reveal the trash button only while hovering the portrait (or when it
	   gains keyboard focus). On touch devices there's no hover, so keep it
	   visible there. */
	.pu-wrap:hover .pu-clear,
	.pu-clear:focus-visible {
		opacity: 1;
	}
	@media (hover: none) {
		.pu-clear {
			opacity: 1;
		}
	}
	.pu-clear :global(svg) {
		width: 12px;
		height: 12px;
		fill: currentColor;
	}
	.pu-clear:hover {
		background: rgba(0, 0, 0, 0.8);
	}
</style>
