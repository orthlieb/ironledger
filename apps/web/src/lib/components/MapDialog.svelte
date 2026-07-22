<script lang="ts">
	/**
	 * MapDialog — Tier 1 campaign-map canvas.
	 *
	 * SVG-rendered pointy-top hex grid (20×15, ~250 cells). Paint-only —
	 * pick a terrain from the palette, click a hex, it fills. Erase mode
	 * removes the cell from the sparse store. No markers, no fill/path
	 * tools, no faction overlay — those are Tier 2/3.
	 *
	 * Follows CLAUDE.md's iOS-safe dialog rules: `vh` (not `dvh`), centred
	 * via top:50%+transform, no `display:flex` on the dialog itself,
	 * max-height on the scrollable body with `overscroll-behavior: contain`.
	 *
	 * State lives in $lib/mapStore; geometry (axial→pixel, viewBox) in
	 * $lib/mapGeometry. Everything reactive to `mapState.cells` re-renders
	 * automatically when paintHex mutates the sparse array.
	 */

	import { headingText } from '$lib/fontStore.svelte.js';
	import DialogHeader from './DialogHeader.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import { tooltip } from '$lib/actions/tooltip.js';
	import {
		TERRAINS,
		TERRAIN_COLORS,
		TERRAIN_LABELS,
		MAP_COLS,
		MAP_ROWS,
	} from '$lib/mapConstants.js';
	import type { Terrain } from '$lib/mapConstants.js';
	import { axialToPx, hexPolygonPoints, allCells, mapViewBox } from '$lib/mapGeometry.js';
	import { mapState, terrainAt, paintHex, clearMap, hasAnyCells } from '$lib/mapStore.svelte.js';

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let clearDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let selectedTerrain = $state<Terrain>('plains');
	let eraseMode = $state(false);

	export function open() {
		dialogEl?.showModal();
	}
	export function close() {
		dialogEl?.close();
	}

	// Cells + viewBox are static per grid dimensions; compute once. The
	// sparse cell array in mapState drives hex fills via terrainAt(q, r)
	// on each hex — Svelte 5's proxy tracks the read so paintHex triggers
	// only the affected <polygon> to update.
	const cells = [...allCells()];
	const vb = mapViewBox();
	// Number of painted cells — reactive on mapState.cells so the "Clear"
	// disabled state updates as soon as the map is wiped or first painted.
	const paintedCount = $derived(mapState.cells.length);

	function onHexClick(q: number, r: number) {
		paintHex(q, r, eraseMode ? null : selectedTerrain);
	}

	function pickTerrain(t: Terrain) {
		selectedTerrain = t;
		eraseMode = false;
	}

	function toggleErase() {
		eraseMode = !eraseMode;
	}
</script>

<dialog bind:this={dialogEl} class="mp-dialog" oncancel={close}>
	<DialogHeader title={headingText('Campaign Map')} onclose={close} />

	<div class="mp-toolbar">
		<div class="mp-palette" role="toolbar" aria-label="Terrain palette">
			{#each TERRAINS as t}
				<button
					class="mp-swatch"
					class:mp-swatch-selected={selectedTerrain === t && !eraseMode}
					style="background: {TERRAIN_COLORS[t]}"
					onclick={() => pickTerrain(t)}
					use:tooltip={TERRAIN_LABELS[t]}
					aria-label={TERRAIN_LABELS[t]}
					aria-pressed={selectedTerrain === t && !eraseMode}
				></button>
			{/each}
		</div>
		<div class="mp-tools">
			<button
				class="mp-btn"
				class:mp-btn-active={eraseMode}
				onclick={toggleErase}
				use:tooltip={'Click a hex to remove its terrain'}
				aria-pressed={eraseMode}>Erase</button
			>
			<button
				class="mp-btn mp-btn-danger"
				onclick={() => clearDialogRef?.open()}
				disabled={!hasAnyCells()}
				use:tooltip={'Wipe every painted hex'}>Clear all</button
			>
		</div>
	</div>

	<div class="mp-body">
		<div class="mp-status">
			{paintedCount}
			painted / {MAP_COLS}×{MAP_ROWS} grid
			{#if eraseMode}<span class="mp-status-hint"> · erase mode</span>{/if}
		</div>
		<div class="mp-canvas">
			<svg
				viewBox="{vb.x} {vb.y} {vb.w} {vb.h}"
				preserveAspectRatio="xMidYMid meet"
				aria-label="Campaign map"
			>
				{#each cells as { q, r } (`${q},${r}`)}
					{@const px = axialToPx(q, r)}
					{@const terrain = terrainAt(q, r)}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<polygon
						class="mp-hex"
						class:mp-hex-painted={terrain !== null}
						points={hexPolygonPoints(px.x, px.y)}
						fill={terrain ? TERRAIN_COLORS[terrain] : 'transparent'}
						onclick={() => onHexClick(q, r)}
						role="button"
						tabindex="-1"
						aria-label={terrain
							? `${TERRAIN_LABELS[terrain]} at ${q}, ${r}`
							: `Empty at ${q}, ${r}`}
					></polygon>
				{/each}
			</svg>
		</div>
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
		This will remove all {paintedCount} painted {paintedCount === 1 ? 'hex' : 'hexes'}. This can't
		be undone.
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
		width: min(920px, calc(100vw - 2rem));
		max-height: 85vh;
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
	.mp-palette {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
	}
	.mp-swatch {
		width: 28px;
		height: 28px;
		padding: 0;
		border-radius: 4px;
		border: 2px solid transparent;
		cursor: pointer;
		box-shadow: 0 0 0 1px var(--border);
		transition:
			border-color 0.12s,
			transform 0.08s;
	}
	.mp-swatch:hover {
		transform: scale(1.08);
	}
	.mp-swatch-selected {
		border-color: var(--text-accent);
		transform: scale(1.08);
	}

	.mp-tools {
		display: flex;
		gap: 6px;
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
	.mp-btn-active {
		background: var(--text-accent);
		color: var(--bg-card);
		border-color: var(--text-accent);
	}
	.mp-btn-danger:not(:disabled):hover {
		color: var(--color-danger, #ef4444);
		border-color: var(--color-danger, #ef4444);
	}

	.mp-body {
		max-height: calc(85vh - 6rem);
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
	.mp-status {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		color: var(--text-muted);
		padding: 4px 14px 0;
	}
	.mp-status-hint {
		color: var(--color-danger, #ef4444);
	}
	.mp-canvas {
		flex: 1;
		overflow: auto;
		overscroll-behavior: contain;
		padding: 8px 14px 14px;
	}
	.mp-canvas svg {
		display: block;
		width: 100%;
		height: auto;
		user-select: none;
	}

	.mp-hex {
		stroke: var(--border-mid);
		stroke-width: 1;
		cursor: pointer;
		transition: fill 0.08s;
	}
	.mp-hex:hover {
		stroke: var(--text-accent);
		stroke-width: 2;
	}
	.mp-hex-painted {
		/* Painted cells get a slightly darker border so filled and unfilled
		 * hexes visually separate at a glance. */
		stroke: color-mix(in srgb, var(--text) 25%, transparent);
	}
</style>
