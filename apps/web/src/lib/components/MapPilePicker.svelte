<script lang="ts">
	/**
	 * MapPilePicker — the menu a click on a crowded map point opens (common at
	 * low zoom, where sub-cell placements from a deeper octave collapse onto
	 * the same base cell): each marker there with its icon, or its colour dot
	 * for a label-only marker, its name and its link. Choosing one hands it
	 * back; a click outside closes. Fixed at the click's viewport position,
	 * above the map dialog.
	 */
	import { tooltip } from '#lib/actions/tooltip.js';
	import { resolveMarkerIcon } from '#lib/settlementIcons.svelte.js';
	import { DEFAULT_MARKER_COLOR, haloPaddedViewBox, mapGlyphInner } from '#lib/mapConstants.js';
	import { markerShowsIcon, type MapMarker } from '#lib/mapStore.svelte.js';
	import { resolveEntity } from '#lib/mapEntityLinks.js';

	let {
		markers,
		x,
		y,
		onchoose,
		onclose,
	}: {
		/** The markers at the clicked point. */
		markers: MapMarker[];
		/** The click's viewport position; the menu opens just below it. */
		x: number;
		y: number;
		onchoose: (m: MapMarker) => void;
		onclose: () => void;
	} = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="mp-pile-backdrop" onclick={onclose}></div>
<ul
	class="mp-pile-menu"
	role="listbox"
	aria-label="Markers here"
	style="left: {x}px; top: {y + 8}px"
>
	<li class="mp-pile-header">{markers.length} markers here</li>
	{#each markers as m (m.id)}
		{@const ic = resolveMarkerIcon(m)}
		{@const link = resolveEntity(m.entityId)}
		<li>
			<button class="mp-pile-item" onclick={() => onchoose(m)} aria-label={m.label || '(no name)'}>
				<!-- Respect the marker's type: a label-only marker shows the
				     colour dot, not its (hidden) icon — same as the canvas. -->
				{#if markerShowsIcon(m) && ic}
					<svg class="mp-pile-icon" viewBox={haloPaddedViewBox(ic)} aria-hidden="true">
						<!-- 'proportional' halo: same contrast glow as the map, sized
						     to the icon so it isn't a faint hairline at the menu's
						     larger icon size; keeps a light-coloured marker icon legible
						     on the menu's `--bg-control` background. -->
						{@html mapGlyphInner(
							ic,
							m.color || DEFAULT_MARKER_COLOR,
							`pile-${m.id}`,
							'proportional',
							20,
						)}
					</svg>
				{:else}
					<span class="mp-pile-icon-fallback" style="background:{m.color || DEFAULT_MARKER_COLOR}"
					></span>
				{/if}
				<span class="mp-pile-label">{m.label || '(no name)'}</span>
				{#if link}
					<span
						class="mp-pile-link"
						use:tooltip={`Linked to ${link.kindLabel}: ${link.name}`}
						aria-label={`Linked to ${link.kindLabel}: ${link.name}`}>{link.kindPrefix}</span
					>
				{/if}
			</button>
		</li>
	{/each}
</ul>

<style>
	/* Pile-up picker — fixed-positioned floating menu that appears when a
	   snap point holds more than one marker. z-index sits above the
	   <dialog>'s top-layer chrome so it renders over the map + toolbars
	   without being clipped by the dialog's overflow: hidden. */
	:global(.mp-pile-backdrop) {
		position: fixed;
		inset: 0;
		z-index: 40;
		background: transparent;
	}
	:global(.mp-pile-menu) {
		position: fixed;
		z-index: 41;
		min-width: 200px;
		max-width: 320px;
		max-height: 60vh;
		overflow-y: auto;
		overscroll-behavior: contain;
		list-style: none;
		margin: 0;
		padding: 4px 0;
		background: var(--bg-card);
		color: var(--text);
		border: 1px solid var(--border-mid);
		border-radius: 6px;
		box-shadow: 0 8px 24px #00000060;
		font-family: var(--font-ui);
		font-size: 0.85rem;
	}
	:global(.mp-pile-header) {
		padding: 4px 12px 6px;
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-dimmer);
		border-bottom: 1px solid var(--border);
		margin-bottom: 4px;
	}
	:global(.mp-pile-item) {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		background: none;
		border: none;
		text-align: left;
		color: var(--text);
		cursor: pointer;
		font-family: inherit;
		font-size: inherit;
	}
	:global(.mp-pile-item:hover) {
		background: var(--bg-control);
	}
	:global(.mp-pile-icon) {
		width: 20px;
		height: 20px;
		flex-shrink: 0;
	}
	:global(.mp-pile-icon-fallback) {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: 1px solid #fff;
		flex-shrink: 0;
	}
	:global(.mp-pile-label) {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	:global(.mp-pile-link) {
		color: var(--text-accent);
		font-size: 0.9rem;
	}
</style>
