<script lang="ts">
	/**
	 * MapDialog — Tier 1a annotate-a-map surface.
	 *
	 * A user-uploaded background image sits under a translucent hex grid.
	 * Clicking a hex opens the inline marker editor to add or update a
	 * label + icon + optional entity link. Multiple markers per hex are
	 * allowed at the data-model level; the UI shows them stacked at the
	 * hex centre in Tier 1a and can be split into a picker later.
	 *
	 * Layout: three SVG layers stacked in <svg> render order:
	 *   1. background <image> (fit preserving aspect ratio via
	 *      preserveAspectRatio="xMidYMid meet"; letterbox transparent
	 *      hexes fall onto the dialog's own background colour).
	 *   2. hex grid — every cell is one <polygon>, translucent stroke, no
	 *      fill. Click handler on the polygon opens the marker editor.
	 *   3. marker layer — icon + optional label, positioned at the hex
	 *      centre.
	 *
	 * Follows CLAUDE.md's iOS-safe dialog rules: `vh` (not `dvh`), centred
	 * via top:50%+transform, no `display: flex` on the dialog itself,
	 * max-height on the scrollable body with overscroll-behavior: contain.
	 */

	import { headingText } from '$lib/fontStore.svelte.js';
	import DialogHeader from './DialogHeader.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import { tooltip } from '$lib/actions/tooltip.js';
	import { MARKER_ICONS, MARKER_ICON_LABELS } from '$lib/mapConstants.js';
	import type { MarkerIcon } from '$lib/mapConstants.js';
	import { axialToPx, hexPolygonPoints, allCells, mapViewBox } from '$lib/mapGeometry.js';
	import {
		mapState,
		markersAt,
		addMarker,
		updateMarker,
		removeMarker,
		setBackground,
		clearMap,
		hasAnyContent,
		initMap,
		backgroundUrl,
	} from '$lib/mapStore.svelte.js';
	import { downscaleImage, MapImageError } from '$lib/mapImage.js';
	import { exportMapPng, exportMapJson } from '$lib/mapExport.js';

	// Icon svgs — imported as raw text so we can inline them in the SVG.
	import iconSettlement from '$icons/village.svg?raw';
	import iconHamlet from '$icons/hut.svg?raw';
	import iconRuin from '$icons/dungeon-gate.svg?raw';
	import iconEncounter from '$icons/sword.svg?raw';
	import iconDanger from '$icons/skull-crossbones-solid-full.svg?raw';
	import iconQuest from '$icons/treasure-map.svg?raw';
	import iconPoi from '$icons/star-solid-full.svg?raw';
	import iconMarker from '$icons/location-dot-solid-full.svg?raw';

	/** SVG source for each marker icon slug — kept alongside the icon enum
	 *  so a compiler catches a missing entry. */
	const ICON_SVG: Record<MarkerIcon, string> = {
		settlement: iconSettlement,
		hamlet: iconHamlet,
		ruin: iconRuin,
		encounter: iconEncounter,
		danger: iconDanger,
		quest: iconQuest,
		poi: iconPoi,
		marker: iconMarker,
	};

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let clearDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let fileInputEl = $state<HTMLInputElement | null>(null);
	let showLabels = $state(true);
	let uploadError = $state('');

	// The marker being edited (or created) via the inline editor panel.
	// `editing = null` means the editor is closed.
	interface EditingState {
		id: string | null; // null while creating; set to existing id when editing
		q: number;
		r: number;
		label: string;
		icon: MarkerIcon;
	}
	let editing = $state<EditingState | null>(null);

	export function open() {
		// Fetch the map on first open (idempotent). Non-blocking — the
		// dialog opens immediately, contents fade in as they arrive.
		void initMap();
		dialogEl?.showModal();
	}
	export function close() {
		dialogEl?.close();
	}

	let svgEl = $state<SVGSVGElement | null>(null);

	function handleExportPng() {
		if (!svgEl) return;
		void exportMapPng(svgEl, showLabels);
	}
	function handleExportJson() {
		exportMapJson({
			markers: mapState.markers,
			backgroundHash: mapState.backgroundHash,
			backgroundUrl: backgroundUrl(),
		});
	}

	const cells = [...allCells()];
	const vb = mapViewBox();
	const markerCount = $derived(mapState.markers.length);

	function onHexClick(q: number, r: number) {
		// If a marker exists on the hex, edit the first one; else create.
		const existing = markersAt(q, r)[0];
		if (existing) {
			editing = {
				id: existing.id,
				q: existing.q,
				r: existing.r,
				label: existing.label,
				icon: existing.icon,
			};
		} else {
			editing = { id: null, q, r, label: '', icon: 'marker' };
		}
	}

	function commitEditing() {
		if (!editing) return;
		const label = editing.label.trim();
		if (editing.id !== null) {
			updateMarker(editing.id, { label, icon: editing.icon });
		} else {
			addMarker({ q: editing.q, r: editing.r, label, icon: editing.icon });
		}
		editing = null;
	}

	function cancelEditing() {
		editing = null;
	}

	function deleteEditing() {
		if (editing?.id) removeMarker(editing.id);
		editing = null;
	}

	async function handleFileChosen(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = ''; // reset so the same file can be re-picked
		if (!file) return;
		uploadError = '';
		try {
			const dataUrl = await downscaleImage(file);
			setBackground(dataUrl);
		} catch (err) {
			uploadError = err instanceof MapImageError ? err.message : 'Failed to load image.';
		}
	}

	function triggerUpload() {
		fileInputEl?.click();
	}

	// Cached icon size in SVG user units — pixel size the icon renders at.
	// Sits comfortably inside a hex without spilling into neighbours.
	const ICON_SIZE = 20;
</script>

<dialog bind:this={dialogEl} class="mp-dialog" oncancel={close}>
	<DialogHeader title={headingText('Campaign Map')} onclose={close} />

	<div class="mp-toolbar">
		<div class="mp-tools">
			<button
				class="mp-btn"
				onclick={triggerUpload}
				use:tooltip={'Upload a background image (JPEG or PNG, ≤20 MB)'}>Upload image</button
			>
			<label class="mp-toggle" use:tooltip={'Show or hide marker labels'}>
				<input type="checkbox" bind:checked={showLabels} /> Names
			</label>
		</div>
		<div class="mp-tools">
			<span class="mp-count">{markerCount} marker{markerCount === 1 ? '' : 's'}</span>
			<button
				class="mp-btn"
				onclick={handleExportPng}
				disabled={!hasAnyContent()}
				use:tooltip={'Download a PNG snapshot of the map with the grid + markers baked in'}
				>Export PNG</button
			>
			<button
				class="mp-btn"
				onclick={handleExportJson}
				disabled={!hasAnyContent()}
				use:tooltip={'Download the marker list + a link to the background image as JSON'}
				>Export JSON</button
			>
			<button
				class="mp-btn mp-btn-danger"
				onclick={() => clearDialogRef?.open()}
				disabled={!hasAnyContent()}
				use:tooltip={'Clear the background and every marker'}>Clear map</button
			>
		</div>
		<input
			bind:this={fileInputEl}
			type="file"
			accept="image/*"
			hidden
			onchange={handleFileChosen}
		/>
	</div>

	{#if uploadError}
		<div class="mp-error">{uploadError}</div>
	{/if}

	<div class="mp-body">
		<div class="mp-canvas">
			<svg
				bind:this={svgEl}
				viewBox="{vb.x} {vb.y} {vb.w} {vb.h}"
				preserveAspectRatio="xMidYMid meet"
				aria-label="Campaign map"
			>
				{#if mapState.backgroundHash}
					<!-- Background image — fitted to the same bounds as the hex
					     grid, aspect ratio preserved via xMidYMid meet. -->
					<image
						x={vb.x}
						y={vb.y}
						width={vb.w}
						height={vb.h}
						href={backgroundUrl()}
						preserveAspectRatio="xMidYMid meet"
						aria-hidden="true"
					/>
				{/if}

				<!-- Hex grid overlay. -->
				{#each cells as { q, r } (`${q},${r}`)}
					{@const px = axialToPx(q, r)}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<polygon
						class="mp-hex"
						points={hexPolygonPoints(px.x, px.y)}
						onclick={() => onHexClick(q, r)}
						role="button"
						tabindex="-1"
						aria-label={`Hex ${q}, ${r}`}
					></polygon>
				{/each}

				<!-- Marker layer — icon centred on the hex, optional label
				     below. Rendered last so it sits above the grid. -->
				{#each mapState.markers as m (m.id)}
					{@const px = axialToPx(m.q, m.r)}
					<g class="mp-marker" transform="translate({px.x} {px.y})">
						<g class="mp-marker-icon" transform="translate({-ICON_SIZE / 2} {-ICON_SIZE / 2})"
							>{@html ICON_SVG[m.icon]
								.replace('<svg', `<svg width="${ICON_SIZE}" height="${ICON_SIZE}"`)
								.replace(/<path/g, '<path fill="var(--text)"')}</g
						>
						{#if showLabels && m.label}
							<text class="mp-marker-label" y={ICON_SIZE / 2 + 10}>{m.label}</text>
						{/if}
					</g>
				{/each}
			</svg>
		</div>

		{#if editing}
			<div class="mp-editor" role="region" aria-label="Marker editor">
				<div class="mp-editor-header">
					<strong>{editing.id ? 'Edit marker' : 'New marker'}</strong>
					<span class="mp-editor-coord">at ({editing.q}, {editing.r})</span>
				</div>

				<label class="mp-field">
					<span class="mp-field-label">Label</span>
					<input
						class="mp-input"
						type="text"
						placeholder="e.g. Driftwood"
						bind:value={editing.label}
						onkeydown={(e) => {
							if (e.key === 'Enter') commitEditing();
							if (e.key === 'Escape') cancelEditing();
						}}
					/>
				</label>

				<div class="mp-field">
					<span class="mp-field-label">Icon</span>
					<div class="mp-icon-picker">
						{#each MARKER_ICONS as icon}
							<button
								class="mp-icon-swatch"
								class:mp-icon-swatch-selected={editing.icon === icon}
								onclick={() => (editing!.icon = icon)}
								use:tooltip={MARKER_ICON_LABELS[icon]}
								aria-label={MARKER_ICON_LABELS[icon]}
								aria-pressed={editing.icon === icon}>{@html ICON_SVG[icon]}</button
							>
						{/each}
					</div>
				</div>

				<div class="mp-editor-footer">
					{#if editing.id}
						<button class="mp-btn mp-btn-danger" onclick={deleteEditing}>Delete</button>
					{/if}
					<div class="mp-editor-footer-right">
						<button class="mp-btn" onclick={cancelEditing}>Cancel</button>
						<button class="mp-btn mp-btn-primary" onclick={commitEditing}>Save</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
</dialog>

<ConfirmDialog
	bind:this={clearDialogRef}
	title="Clear Campaign Map?"
	confirmLabel="Clear Map"
	onconfirm={clearMap}
>
	<p
		style="font-family: var(--font-ui); font-size: 0.82rem; color: var(--text-muted); margin: 0; line-height: 1.5;"
	>
		This will remove the background image and every marker on the map. This can't be undone.
	</p>
</ConfirmDialog>

<style>
	.mp-dialog {
		border: none;
		padding: 0;
		border-radius: 10px;
		position: fixed;
		top: 50%;
		left: 50%;
		margin: 0;
		transform: translate(-50%, -50%);
		width: min(960px, calc(100vw - 2rem));
		max-height: 88vh;
		overflow: hidden;
		background: var(--bg-card);
		color: var(--text);
		box-shadow:
			0 16px 48px #00000070,
			0 0 0 1px var(--border-mid);
		outline: none;
	}
	.mp-dialog::backdrop {
		background: #00000060;
		backdrop-filter: blur(1px);
	}

	.mp-toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 8px 14px;
		background: var(--bg-inset);
		border-bottom: 1px solid var(--border);
		flex-wrap: wrap;
	}
	.mp-tools {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.mp-count {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		color: var(--text-muted);
	}
	.mp-toggle {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-family: var(--font-ui);
		font-size: 0.72rem;
		color: var(--text-muted);
		cursor: pointer;
	}
	.mp-toggle input {
		accent-color: var(--text-accent);
	}

	.mp-btn {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		padding: 4px 12px;
		background: var(--bg-control);
		color: var(--text-muted);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		cursor: pointer;
	}
	.mp-btn:hover:not(:disabled) {
		color: var(--text);
		border-color: var(--text-accent);
	}
	.mp-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.mp-btn-primary {
		background: var(--text-accent);
		color: var(--bg-card);
		border-color: var(--text-accent);
	}
	.mp-btn-danger:not(:disabled):hover {
		color: var(--color-danger, #ef4444);
		border-color: var(--color-danger, #ef4444);
	}

	.mp-error {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		color: var(--color-danger, #ef4444);
		padding: 4px 14px;
		background: color-mix(in srgb, var(--color-danger, #ef4444) 8%, transparent);
	}

	.mp-body {
		max-height: calc(88vh - 6rem);
		overflow: hidden;
	}
	.mp-canvas {
		overflow: auto;
		overscroll-behavior: contain;
		padding: 8px 14px 14px;
		background: var(--bg-inset);
	}
	.mp-canvas svg {
		display: block;
		width: 100%;
		height: auto;
		user-select: none;
	}

	.mp-hex {
		fill: transparent;
		stroke: color-mix(in srgb, var(--text) 30%, transparent);
		stroke-width: 0.8;
		cursor: pointer;
		transition: stroke 0.08s;
	}
	.mp-hex:hover {
		stroke: var(--text-accent);
		stroke-width: 1.5;
	}

	/* Marker icon inherits currentColor via the fill rewrite in the
	   {@html} interpolation above; keep a stroke around each icon so it
	   stays readable over busy backgrounds. */
	:global(.mp-marker-icon svg) {
		filter: drop-shadow(0 0 1.5px rgba(0, 0, 0, 0.85));
	}
	:global(.mp-marker-icon path) {
		fill: var(--text);
	}
	.mp-marker-label {
		font-family: var(--font-ui);
		font-size: 8px;
		font-weight: 600;
		text-anchor: middle;
		fill: var(--text);
		paint-order: stroke fill;
		stroke: var(--bg-card);
		stroke-width: 3px;
		stroke-linejoin: round;
	}

	.mp-editor {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px 14px 14px;
		border-top: 1px solid var(--border);
		background: var(--bg-card);
	}
	.mp-editor-header {
		display: flex;
		align-items: baseline;
		gap: 8px;
		font-family: var(--font-ui);
		font-size: 0.82rem;
	}
	.mp-editor-coord {
		font-size: 0.68rem;
		color: var(--text-dimmer);
	}
	.mp-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.mp-field-label {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-dimmer);
	}
	.mp-input {
		width: 100%;
		box-sizing: border-box;
		padding: 5px 8px;
		font-family: var(--font-ui);
		font-size: 0.82rem;
		color: var(--text);
		background: var(--bg-control);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
	}
	.mp-input:focus {
		outline: none;
		border-color: var(--text-accent);
	}

	.mp-icon-picker {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
	}
	.mp-icon-swatch {
		width: 32px;
		height: 32px;
		padding: 4px;
		background: var(--bg-control);
		border: 2px solid transparent;
		border-radius: 4px;
		cursor: pointer;
		color: var(--text);
		box-shadow: 0 0 0 1px var(--border);
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.mp-icon-swatch :global(svg) {
		width: 18px;
		height: 18px;
	}
	.mp-icon-swatch :global(path) {
		fill: currentColor;
	}
	.mp-icon-swatch:hover {
		color: var(--text-accent);
	}
	.mp-icon-swatch-selected {
		border-color: var(--text-accent);
	}

	.mp-editor-footer {
		display: flex;
		justify-content: space-between;
		gap: 6px;
	}
	.mp-editor-footer-right {
		display: flex;
		gap: 6px;
		margin-left: auto;
	}
</style>
