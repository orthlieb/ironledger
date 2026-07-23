<script lang="ts">
	/**
	 * MapDialog — annotate an uploaded map with hex-pinned markers.
	 *
	 * A user-uploaded background image sits under a translucent hex grid.
	 * Clicking a hex places a marker (or selects the existing one) and the
	 * selection toolbar at the top switches to edit its label, icon, color
	 * and optional entity link. Every field auto-saves through the shared
	 * `updateMarker()` optimistic pipeline — no explicit Save/Cancel.
	 *
	 * Layout: three SVG layers stacked in <svg> render order:
	 *   1. background <image> (fit preserving aspect ratio via
	 *      preserveAspectRatio="xMidYMid meet"; letterbox falls onto the
	 *      dialog's own background colour).
	 *   2. hex grid — every cell is one <polygon>, translucent stroke, no
	 *      fill. Click handler opens or selects a marker.
	 *   3. marker layer — icon (colored fill) + optional label, positioned
	 *      at the hex centre.
	 *
	 * Icon vocabulary comes from apps/web/static/map/<category>/<slug>.svg,
	 * indexed at build time into $lib/generated/mapIconManifest. See
	 * scripts/build-map-icons.mjs and vite.config.ts. New markers get the
	 * default icon+color; users override via the selection toolbar's
	 * "Change icon…" nested picker dialog.
	 *
	 * Follows CLAUDE.md's iOS-safe dialog rules: `vh` (not `dvh`), centred
	 * via top:50%+transform, no `display: flex` on the dialog itself,
	 * max-height on the scrollable body with overscroll-behavior: contain.
	 */

	import { headingText } from '$lib/fontStore.svelte.js';
	import DialogHeader from './DialogHeader.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import { tooltip } from '$lib/actions/tooltip.js';
	import {
		DEFAULT_MARKER_COLOR,
		DEFAULT_MARKER_ICON,
		MARKER_COLOR_PRESETS,
		resolveMapIcon,
	} from '$lib/mapConstants.js';
	import {
		MAP_ICON_CATEGORIES,
		MAP_ICON_LIST,
		type MapIcon,
	} from '$lib/generated/mapIconManifest.js';
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
	import { getLinkableEntities, resolveEntity } from '$lib/mapEntityLinks.js';

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let clearDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let iconDialogEl = $state<HTMLDialogElement | null>(null);
	let fileInputEl = $state<HTMLInputElement | null>(null);
	let showLabels = $state(true);
	let uploadError = $state('');
	let iconSearch = $state('');

	/** Id of the selected marker (null = nothing selected). Deriving the
	 *  live marker record from the store keeps every field auto-current
	 *  even if another surface mutates the array. */
	let selectedMarkerId = $state<string | null>(null);
	const selectedMarker = $derived(
		selectedMarkerId ? (mapState.markers.find((m) => m.id === selectedMarkerId) ?? null) : null,
	);

	export function open() {
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

	/**
	 * Hex click. Bare click on a linked marker jumps to that entity and
	 * closes the map. Shift+click always selects for editing — a modifier
	 * lets the user edit a linked marker without triggering the jump.
	 * Bare click on an unlinked hex either selects the existing marker or
	 * creates one and selects it.
	 */
	function onHexClick(q: number, r: number, ev: MouseEvent) {
		const existing = markersAt(q, r)[0];
		if (existing && !ev.shiftKey) {
			const link = resolveEntity(existing.entityId);
			if (link) {
				document.dispatchEvent(
					new CustomEvent('ironledger:focus-entity', {
						detail: { kind: link.kind, id: link.id },
					}),
				);
				close();
				return;
			}
		}
		if (existing) {
			selectedMarkerId = existing.id;
		} else {
			const id = addMarker({
				q,
				r,
				label: '',
				icon: DEFAULT_MARKER_ICON,
				color: DEFAULT_MARKER_COLOR,
			});
			selectedMarkerId = id;
		}
	}

	function clearSelection() {
		selectedMarkerId = null;
	}

	function onLabelInput(e: Event) {
		if (!selectedMarker) return;
		updateMarker(selectedMarker.id, { label: (e.target as HTMLInputElement).value });
	}

	function onColorInput(e: Event) {
		if (!selectedMarker) return;
		updateMarker(selectedMarker.id, { color: (e.target as HTMLInputElement).value });
	}

	function pickPreset(color: string) {
		if (!selectedMarker) return;
		updateMarker(selectedMarker.id, { color });
	}

	function onEntityChange(e: Event) {
		if (!selectedMarker) return;
		const v = (e.target as HTMLSelectElement).value;
		const patch: { entityId?: string; label?: string } = { entityId: v || undefined };
		// Auto-fill label from the linked entity's name when the current
		// label is blank — matches the "annotation follows the entity"
		// mental model without stomping on a name the user typed.
		if (v && !selectedMarker.label.trim()) {
			const link = resolveEntity(v);
			if (link) patch.label = link.name;
		}
		updateMarker(selectedMarker.id, patch);
	}

	function deleteSelected() {
		if (!selectedMarker) return;
		removeMarker(selectedMarker.id);
		selectedMarkerId = null;
	}

	function openIconPicker() {
		if (!selectedMarker) return;
		iconSearch = '';
		iconDialogEl?.showModal();
	}
	function closeIconPicker() {
		iconDialogEl?.close();
	}
	function pickIcon(key: string) {
		if (!selectedMarker) {
			closeIconPicker();
			return;
		}
		updateMarker(selectedMarker.id, { icon: key });
		closeIconPicker();
	}

	function iconKey(i: MapIcon): string {
		return `${i.category}/${i.slug}`;
	}

	const filteredIcons = $derived.by<Record<string, MapIcon[]>>(() => {
		const q = iconSearch.trim().toLowerCase();
		const grouped: Record<string, MapIcon[]> = {};
		for (const cat of MAP_ICON_CATEGORIES) grouped[cat] = [];
		for (const i of MAP_ICON_LIST) {
			if (
				q &&
				!i.slug.toLowerCase().includes(q) &&
				!i.label.toLowerCase().includes(q) &&
				!i.category.toLowerCase().includes(q)
			) {
				continue;
			}
			grouped[i.category]?.push(i);
		}
		// Drop empty categories so the picker doesn't render headers with
		// nothing under them when a search filter is on.
		for (const cat of Object.keys(grouped)) if (grouped[cat].length === 0) delete grouped[cat];
		return grouped;
	});

	async function handleFileChosen(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
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

	/** Cached icon size in SVG user units — pixel size the icon renders at.
	 *  Sits comfortably inside a hex without spilling into neighbours. */
	const ICON_SIZE = 20;

	// Derive the selected marker's icon record + color for the toolbar so
	// the icon button always shows the current preview.
	const selectedIcon = $derived(selectedMarker ? resolveMapIcon(selectedMarker.icon) : undefined);
	const selectedColor = $derived(selectedMarker?.color || DEFAULT_MARKER_COLOR);
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

	<!--
		Selection toolbar. Sits above the map so it never scrolls off. Renders
		a hint when nothing is selected; switches to the marker's editable
		fields on click. Every input auto-saves via updateMarker() so there
		is no Save/Cancel — the marker is the working copy.
	-->
	<div class="mp-sel-toolbar" class:mp-sel-empty={!selectedMarker}>
		{#if selectedMarker && selectedIcon}
			<span class="mp-sel-coord" title="Hex ({selectedMarker.q}, {selectedMarker.r})"
				>({selectedMarker.q},{selectedMarker.r})</span
			>
			<input
				class="mp-sel-name"
				type="text"
				placeholder="Marker name…"
				value={selectedMarker.label}
				oninput={onLabelInput}
				use:tooltip={'Name shown under the icon on the map'}
			/>
			<button
				class="mp-sel-icon-btn"
				onclick={openIconPicker}
				use:tooltip={'Change icon'}
				aria-label="Change icon"
			>
				<svg viewBox={selectedIcon.viewBox} aria-hidden="true">
					<g fill={selectedColor}>{@html selectedIcon.inner}</g>
				</svg>
				<span class="mp-sel-icon-label">{selectedIcon.label}</span>
			</button>
			<div class="mp-sel-color-group">
				<input
					class="mp-sel-color"
					type="color"
					value={selectedColor}
					oninput={onColorInput}
					use:tooltip={'Icon color'}
					aria-label="Icon color"
				/>
				<div class="mp-sel-presets" role="group" aria-label="Preset colors">
					{#each MARKER_COLOR_PRESETS as c}
						<button
							class="mp-sel-preset"
							class:mp-sel-preset-selected={selectedColor.toLowerCase() === c.toLowerCase()}
							style="background:{c}"
							onclick={() => pickPreset(c)}
							use:tooltip={c}
							aria-label={c}
						></button>
					{/each}
				</div>
			</div>
			<select
				class="mp-sel-entity"
				value={selectedMarker.entityId ?? ''}
				onchange={onEntityChange}
				use:tooltip={'Optional link to a Community, Place, Journey or Site'}
				aria-label="Link to entity"
			>
				<option value="">— No link —</option>
				{#each getLinkableEntities() as e}
					<option value="{e.kind}:{e.id}">{e.kindPrefix} {e.kindLabel}: {e.name}</option>
				{/each}
			</select>
			<button
				class="mp-btn mp-btn-danger"
				onclick={deleteSelected}
				use:tooltip={'Delete this marker'}
				aria-label="Delete marker">Delete</button
			>
			<button
				class="mp-btn"
				onclick={clearSelection}
				use:tooltip={'Deselect and close the editor'}
				aria-label="Close editor">Done</button
			>
		{:else}
			<span class="mp-sel-hint"
				>Click a hex to place or edit a marker. Shift-click a linked marker to edit instead of
				jumping.</span
			>
		{/if}
	</div>

	{#if uploadError}
		<div class="mp-error">{uploadError}</div>
	{/if}

	{#if selectedMarker && selectedMarker.entityId && !resolveEntity(selectedMarker.entityId)}
		<div class="mp-warn">
			Linked entity was deleted — pick a new one from the dropdown or clear the link.
		</div>
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
					<image
						x={vb.x}
						y={vb.y}
						width={vb.w}
						height={vb.h}
						href={backgroundUrl()}
						preserveAspectRatio="xMidYMid meet"
						aria-hidden="true"
						onerror={() => (mapState.backgroundHash = '')}
					/>
				{/if}

				{#each cells as { q, r } (`${q},${r}`)}
					{@const px = axialToPx(q, r)}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<polygon
						class="mp-hex"
						points={hexPolygonPoints(px.x, px.y)}
						onclick={(ev) => onHexClick(q, r, ev)}
						role="button"
						tabindex="-1"
						aria-label={`Hex ${q}, ${r}`}
					></polygon>
				{/each}

				{#each mapState.markers as m (m.id)}
					{@const px = axialToPx(m.q, m.r)}
					{@const ic = resolveMapIcon(m.icon)}
					{@const color = m.color || DEFAULT_MARKER_COLOR}
					<g
						class="mp-marker"
						class:mp-marker-selected={m.id === selectedMarkerId}
						transform="translate({px.x} {px.y})"
					>
						{#if ic}
							<svg
								class="mp-marker-icon"
								x={-ICON_SIZE / 2}
								y={-ICON_SIZE / 2}
								width={ICON_SIZE}
								height={ICON_SIZE}
								viewBox={ic.viewBox}
							>
								<g fill={color}>{@html ic.inner}</g>
							</svg>
						{:else}
							<!-- Unknown icon slug — draw a solid dot so the marker
							     stays visible even after an icon deletion. -->
							<circle r={ICON_SIZE / 2 - 2} fill={color} />
						{/if}
						{#if showLabels && m.label}
							<text class="mp-marker-label" y={ICON_SIZE / 2 + 10}>{m.label}</text>
						{/if}
					</g>
				{/each}
			</svg>
		</div>
	</div>
</dialog>

<!--
	Icon picker — nested modal that lists every manifest icon grouped by
	category with a search filter. Live-color-previews using the currently-
	selected marker's color so users can see what they'll get.
-->
<dialog bind:this={iconDialogEl} class="mp-icon-dialog" oncancel={closeIconPicker}>
	<DialogHeader title={headingText('Choose Icon')} onclose={closeIconPicker} radius="8px 8px 0 0" />
	<div class="mp-icon-search-row">
		<input class="mp-icon-search" type="text" placeholder="Search icons…" bind:value={iconSearch} />
	</div>
	<div class="mp-icon-body">
		{#each Object.keys(filteredIcons) as cat (cat)}
			<div class="mp-icon-cat-label">{filteredIcons[cat][0].categoryLabel}</div>
			<div class="mp-icon-grid">
				{#each filteredIcons[cat] as ic (iconKey(ic))}
					{@const key = iconKey(ic)}
					<button
						class="mp-icon-tile"
						class:mp-icon-tile-selected={selectedMarker?.icon === key}
						onclick={() => pickIcon(key)}
						use:tooltip={ic.label}
						aria-label={ic.label}
					>
						<svg viewBox={ic.viewBox} aria-hidden="true">
							<g fill={selectedColor}>{@html ic.inner}</g>
						</svg>
					</button>
				{/each}
			</div>
		{/each}
		{#if Object.keys(filteredIcons).length === 0}
			<p class="mp-icon-empty">No icons match "{iconSearch}".</p>
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
	.mp-btn-danger:not(:disabled):hover {
		color: var(--color-danger, #ef4444);
		border-color: var(--color-danger, #ef4444);
	}

	/* Selection toolbar — sits below the file/export toolbar. Shows a hint
	   when empty; the marker's editable fields when a marker is selected.
	   Wraps at narrow widths so mobile still fits every control. */
	.mp-sel-toolbar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 14px;
		background: var(--bg-card);
		border-bottom: 1px solid var(--border);
		flex-wrap: wrap;
		font-family: var(--font-ui);
		font-size: 0.75rem;
	}
	.mp-sel-empty {
		color: var(--text-dimmer);
	}
	.mp-sel-hint {
		font-style: italic;
	}
	.mp-sel-coord {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.7rem;
		color: var(--text-dimmer);
		background: var(--bg-inset);
		padding: 2px 6px;
		border-radius: 3px;
	}
	.mp-sel-name {
		flex: 1 1 140px;
		min-width: 100px;
		padding: 5px 8px;
		font-family: var(--font-ui);
		font-size: 0.82rem;
		color: var(--text);
		background: var(--bg-control);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
	}
	.mp-sel-name:focus {
		outline: none;
		border-color: var(--text-accent);
	}
	.mp-sel-icon-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 3px 8px 3px 4px;
		background: var(--bg-control);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		cursor: pointer;
		color: var(--text);
		font-family: var(--font-ui);
		font-size: 0.72rem;
		max-width: 180px;
	}
	.mp-sel-icon-btn:hover {
		border-color: var(--text-accent);
	}
	.mp-sel-icon-btn svg {
		width: 22px;
		height: 22px;
		flex-shrink: 0;
	}
	.mp-sel-icon-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.mp-sel-color-group {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.mp-sel-color {
		width: 28px;
		height: 28px;
		padding: 0;
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		background: transparent;
		cursor: pointer;
	}
	.mp-sel-color::-webkit-color-swatch-wrapper {
		padding: 2px;
	}
	.mp-sel-color::-webkit-color-swatch {
		border: none;
		border-radius: 2px;
	}
	.mp-sel-presets {
		display: inline-flex;
		gap: 3px;
	}
	.mp-sel-preset {
		width: 16px;
		height: 16px;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 3px;
		cursor: pointer;
	}
	.mp-sel-preset:hover {
		transform: scale(1.15);
	}
	.mp-sel-preset-selected {
		outline: 2px solid var(--text-accent);
		outline-offset: 1px;
	}
	.mp-sel-entity {
		padding: 4px 6px;
		font-family: var(--font-ui);
		font-size: 0.75rem;
		color: var(--text);
		background: var(--bg-control);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		max-width: 180px;
	}

	.mp-error {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		color: var(--color-danger, #ef4444);
		padding: 4px 14px;
		background: color-mix(in srgb, var(--color-danger, #ef4444) 8%, transparent);
	}
	.mp-warn {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		color: var(--color-danger, #ef4444);
		padding: 4px 14px;
		background: color-mix(in srgb, var(--color-danger, #ef4444) 8%, transparent);
	}

	.mp-body {
		max-height: calc(88vh - 8rem);
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
	/* Suppress the default focus rectangle browsers draw around a
	   role="button" polygon after click — the hover-stroke already
	   provides adequate feedback, and hex maps are pointer-driven. */
	.mp-hex:focus,
	.mp-hex:focus-visible {
		outline: none;
	}

	.mp-marker {
		pointer-events: none;
	}
	.mp-marker-selected {
		filter: drop-shadow(0 0 3px var(--text-accent));
	}
	:global(.mp-marker-icon) {
		overflow: visible;
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

	/* Icon picker dialog. Uses the CLAUDE.md content-sized pattern:
	   no display:flex on the dialog, max-height on the scrollable body. */
	.mp-icon-dialog {
		border: none;
		padding: 0;
		border-radius: 8px;
		position: fixed;
		top: 50%;
		left: 50%;
		margin: 0;
		transform: translate(-50%, -50%);
		width: min(720px, calc(100vw - 2rem));
		max-height: 82vh;
		overflow: hidden;
		background: var(--bg-card);
		color: var(--text);
		box-shadow:
			0 16px 48px #00000070,
			0 0 0 1px var(--border-mid);
		outline: none;
	}
	.mp-icon-dialog::backdrop {
		background: #00000060;
	}
	.mp-icon-search-row {
		padding: 8px 14px;
		background: var(--bg-inset);
		border-bottom: 1px solid var(--border);
	}
	.mp-icon-search {
		width: 100%;
		box-sizing: border-box;
		padding: 6px 10px;
		font-family: var(--font-ui);
		font-size: 0.85rem;
		color: var(--text);
		background: var(--bg-control);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
	}
	.mp-icon-search:focus {
		outline: none;
		border-color: var(--text-accent);
	}
	.mp-icon-body {
		max-height: calc(82vh - 8rem);
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 8px 14px 14px;
	}
	.mp-icon-cat-label {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		margin: 12px 0 6px;
	}
	.mp-icon-cat-label:first-child {
		margin-top: 0;
	}
	.mp-icon-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
		gap: 4px;
	}
	.mp-icon-tile {
		aspect-ratio: 1 / 1;
		padding: 6px;
		background: var(--bg-control);
		border: 1px solid var(--border);
		border-radius: 4px;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.mp-icon-tile:hover {
		border-color: var(--text-accent);
	}
	.mp-icon-tile-selected {
		border-color: var(--text-accent);
		background: color-mix(in srgb, var(--text-accent) 12%, var(--bg-control));
	}
	.mp-icon-tile svg {
		width: 100%;
		height: 100%;
	}
	.mp-icon-empty {
		font-family: var(--font-ui);
		font-size: 0.85rem;
		color: var(--text-dimmer);
		text-align: center;
		padding: 24px 0;
	}
</style>
