<script lang="ts">
	/**
	 * MarkerCard — the campaign map's info card for the selected marker.
	 *
	 * Opens beside a marker when it's selected (a plain click) and the editor
	 * isn't open: a large view of the icon, a title and kind line, and the
	 * linked Connection's Summary as written. A linked marker
	 * gets a Go To button (the jump to the Connection); every marker gets
	 * Edit, which opens the marker editor. What it says comes from
	 * markerSummary().
	 *
	 * A bits-ui Popover anchored to the marker's on-screen icon (customAnchor
	 * plus updatePositionStrategy 'always', so it follows panning, zooming
	 * and arrow-key nudges). It doesn't take focus or dismiss itself on
	 * outside clicks or Escape — the map owns selection, and the card simply
	 * follows it.
	 */
	import { Popover } from 'bits-ui';
	import type { MapMarker } from '$lib/mapStore.svelte.js';
	import type { MapIcon } from '$lib/generated/mapIconManifest.js';
	import { haloPaddedViewBox, mapGlyphInner } from '$lib/mapConstants.js';
	import { markerSummary } from '$lib/markerSummary.js';
	import { renderNote } from '$lib/markdown.js';
	import { ENTITY_KIND_META } from '$lib/entityKinds.js';
	import { contentZ } from '$lib/dialogStack.svelte.js';
	import { tooltip } from '$lib/actions/tooltip.js';
	import gotoSvg from '$icons/arrow-up-right-from-square-solid.svg?raw';
	import closeSvg from '$icons/xmark-solid.svg?raw';

	let {
		open,
		marker,
		icon,
		color,
		anchor,
		baseDepth,
		onjump,
		onedit,
		ondismiss,
	}: {
		open: boolean;
		marker: MapMarker | null;
		icon: MapIcon | undefined;
		/** The marker's colour (roofs of layered icons take it). */
		color: string;
		/** Where the card hangs: the marker icon's on-screen box. */
		anchor: { getBoundingClientRect: () => DOMRect };
		/** The map dialog's dialog-stack depth; the card layers one above it.
		 *  (It doesn't push its own depth: a selection carried over a reopen
		 *  would open the card in the same flush as the map, and a child's
		 *  effect runs first — the card would land beneath its own map.) */
		baseDepth: number;
		/** Go To the linked Connection (closes the map). */
		onjump: (link: { kind: string; id: string }) => void;
		/** Open the marker editor. */
		onedit: () => void;
		/** Hide the card, keeping the marker selected. */
		ondismiss: () => void;
	} = $props();

	const info = $derived(marker ? markerSummary(marker, icon) : null);
</script>

<Popover.Root {open}>
	<Popover.Portal>
		{#if marker && info}
			<Popover.Content
				class="mk-card"
				customAnchor={anchor}
				side="right"
				align="center"
				sideOffset={12}
				collisionPadding={12}
				updatePositionStrategy="always"
				trapFocus={false}
				interactOutsideBehavior="ignore"
				escapeKeydownBehavior="ignore"
				onOpenAutoFocus={(e) => e.preventDefault()}
				onCloseAutoFocus={(e) => e.preventDefault()}
				style={`z-index: ${contentZ(baseDepth + 1)}`}
			>
				<button
					type="button"
					class="mk-close"
					onclick={ondismiss}
					use:tooltip={'Hide'}
					aria-label="Hide marker card">{@html closeSvg}</button
				>
				<div class="mk-head">
					{#if icon}
						<svg class="mk-icon" viewBox={haloPaddedViewBox(icon)} aria-hidden="true">
							{@html mapGlyphInner(icon, color, `mkcard-${marker.id}`, 'proportional')}
						</svg>
					{/if}
					<div class="mk-titles">
						<h3 class="mk-title">{info.title}</h3>
						<span class="mk-kind" style:--kind-color={info.color}>{info.subtitle}</span>
					</div>
				</div>
				{#if info.summary}
					<div class="mk-summary">{@html renderNote(info.summary)}</div>
				{/if}
				<div class="mk-actions">
					<button type="button" class="btn" onclick={onedit}>Edit</button>
					{#if info.linked}
						{@const linked = info.linked}
						<button
							type="button"
							class="btn btn-primary mk-jump"
							onclick={() => onjump({ kind: linked.kind, id: linked.data.id })}
						>
							Go To {ENTITY_KIND_META[linked.kind].label}
							<span class="mk-jump-icon" aria-hidden="true">{@html gotoSvg}</span>
						</button>
					{/if}
				</div>
			</Popover.Content>
		{/if}
	</Popover.Portal>
</Popover.Root>

<style>
	/* Portalled by bits-ui, so every selector is :global(); .mk-* is owned
	   by this component. */
	:global(.mk-card) {
		position: relative;
		width: min(300px, calc(100vw - 24px));
		max-height: min(70vh, 460px);
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 12px 14px;
		background: var(--bg-card);
		color: var(--text);
		border: 1px solid var(--border-mid);
		border-radius: 8px;
		box-shadow: 0 10px 30px #00000055;
		font-family: var(--font-ui);
		outline: none;
	}
	:global(.mk-close) {
		all: unset;
		cursor: pointer;
		position: absolute;
		top: 6px;
		right: 6px;
		width: 22px;
		height: 22px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		color: var(--text-dimmer);
	}
	:global(.mk-close:hover),
	:global(.mk-close:focus-visible) {
		color: var(--text-accent);
	}
	:global(.mk-close svg) {
		width: 12px;
		height: 12px;
		fill: currentColor;
	}
	:global(.mk-head) {
		display: flex;
		align-items: center;
		gap: 12px;
		padding-right: 18px;
	}
	:global(.mk-icon) {
		flex: none;
		width: 96px;
		height: 96px;
	}
	:global(.mk-titles) {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
		min-width: 0;
	}
	:global(.mk-title) {
		margin: 0;
		font-size: 1rem;
		font-weight: 700;
		line-height: 1.2;
		overflow-wrap: anywhere;
	}
	:global(.mk-kind) {
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--kind-color, var(--text-dimmer));
	}
	:global(.mk-summary) {
		margin-top: 10px;
		padding-top: 8px;
		border-top: 1px solid var(--border);
		font-size: 0.85rem;
		line-height: 1.45;
	}
	:global(.mk-summary > :first-child) {
		margin-top: 0;
	}
	:global(.mk-summary > :last-child) {
		margin-bottom: 0;
	}
	:global(.mk-actions) {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 12px;
	}
	:global(.mk-jump) {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	:global(.mk-jump-icon svg) {
		width: 11px;
		height: 11px;
		fill: currentColor;
	}
</style>
