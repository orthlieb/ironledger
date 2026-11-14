<script lang="ts">
	/**
	 * MapIconPicker — the icon-chooser modal extracted out of MapDialog. Lists
	 * every manifest icon grouped by category (bar the settlement kit's baked
	 * Settlement icons, which the builder tabs make) with a live search filter;
	 * each tile previews in the marker's current colour. Purely presentational:
	 * it owns its own search state and reports the picked icon key back to
	 * MapDialog via `onpick`. (Whether a marker shows an icon at all is the
	 * editor's Both / Label / Icon mode, not this picker — so there is no
	 * "no icon" tile.)
	 *
	 * Three tabs (bits-ui Tabs): Icons — the manifest grid, where hovering a
	 * tile lightboxes it at a readable size — then Buildings and Settlement
	 * builder, which generate an icon from a recipe (SettlementBuilder, one
	 * building or a whole settlement) in any culture. The picker opens on the
	 * tab matching the marker's current icon (its recipe, or a bare
	 * settlement-kit icon → Settlement builder).
	 *
	 * The `.mp-icon-*` styles live (as `:global`) in MapDialog's <style> — this
	 * component is only ever rendered by MapDialog, so those rules are always
	 * mounted and style this markup. (A future pass can move them here to make
	 * the component fully self-contained.)
	 */
	import { Dialog, Tabs } from 'bits-ui';
	import SettlementBuilder from '#lib/components/SettlementBuilder.svelte';
	import type { SettlementRecipe } from '#lib/settlementRecipe.js';
	import { pushDialog, popDialog, overlayZ, contentZ } from '#lib/dialogStack.svelte.js';
	import DialogHeader from '#lib/components/DialogHeader.svelte';
	import { headingText } from '#lib/fontStore.svelte.js';
	import { untrack } from 'svelte';
	import {
		MAP_ICON_CATEGORIES,
		MAP_ICON_LIST,
		type MapIcon,
	} from '#lib/generated/mapIconManifest.js';
	import { mapGlyphInner, haloPaddedViewBox } from '#lib/mapConstants.js';
	import { isSourceEnabled } from '#lib/expansionStore.svelte.js';
	import FilterBar from '#lib/components/FilterBar.svelte';

	let {
		open = $bindable(false),
		selectedColor,
		currentIcon,
		currentSettlement,
		onpick,
		onpicksettlement,
		onclose,
	}: {
		/** Two-way: MapDialog opens it; Escape/outside-click closes it. */
		open?: boolean;
		/** Fill colour for the tile previews (the marker's current colour). */
		selectedColor: string;
		/** The marker's current icon key, for the selected-tile highlight. */
		currentIcon: string | null | undefined;
		/** The marker's settlement recipe, if its icon is generated. */
		currentSettlement?: SettlementRecipe;
		/** Called with the chosen icon manifest key. */
		onpick: (key: string) => void;
		/** Called with the recipe a builder tab's "Use this" made. */
		onpicksettlement: (recipe: SettlementRecipe) => void;
		/** Called when the dialog is dismissed. */
		onclose: () => void;
	} = $props();

	let iconSearch = $state('');
	let iconSearchInputEl = $state<HTMLInputElement | null>(null);
	let activeCategories = $state(new Set<string>());
	let filtersOpen = $state(false);
	let stackDepth = $state(1);
	let tab = $state<'icons' | 'buildings' | 'builder'>('icons');
	let useButton = $state<HTMLButtonElement | null>(null);
	let dialogEl = $state<HTMLElement | null>(null);

	/** Deterministic, evenly-spread hue per category so every section and its
	 *  filter pill share one colour. Derived from the manifest's category list
	 *  (the folders under static/map/), so it scales to whatever number the
	 *  developer adds — no hand-picked palette to maintain. OKLCH with a fixed
	 *  lightness/chroma keeps every hue equally legible in both themes (an HSL
	 *  hue-spread would wash the yellows out and darken the blues); the chip and
	 *  section CSS `color-mix` their tints from this base. */
	function categoryColor(index: number, count: number): string {
		const hue = Math.round((index / Math.max(count, 1)) * 360);
		return `oklch(0.64 0.14 ${hue})`;
	}
	const CATEGORY_COLORS: Record<string, string> = Object.fromEntries(
		MAP_ICON_CATEGORIES.map((c, i) => [c, categoryColor(i, MAP_ICON_CATEGORIES.length)]),
	);

	/** Icons on offer: core icons plus those of extensions that are enabled
	 *  (an extension's icons carry `source`). The settlement kit's baked
	 *  icons (the `settlement` category) aren't offered — the Buildings and
	 *  Settlement builder tabs draw any of them in any culture — but stay in
	 *  the manifest for markers that use them and for recipes' fallbacks.
	 *  Markers already placed with a hidden or disabled extension's icon
	 *  keep rendering — this only gates picking. */
	const offeredIcons = $derived(
		MAP_ICON_LIST.filter(
			(i) => i.category !== 'settlement' && (!i.source || isSourceEnabled(i.source)),
		),
	);
	const offeredCategories = $derived(
		MAP_ICON_CATEGORIES.filter((c) => offeredIcons.some((i) => i.category === c)),
	);

	/** Category filter chips for the FilterBar — one per offered category,
	 *  labelled from the manifest (e.g. "beast" → "Beast") and tinted with the
	 *  section colour. "Label only" is deliberately NOT a category here, so it
	 *  never gets a chip and can never be filtered out. */
	const CATEGORY_CHIPS = $derived(
		offeredCategories.map((c) => ({
			key: c,
			label: MAP_ICON_LIST.find((i) => i.category === c)?.categoryLabel ?? c,
			color: CATEGORY_COLORS[c],
		})),
	);
	$effect(() => {
		if (!open) return;
		stackDepth = pushDialog();
		return () => popDialog();
	});

	// Reset the search + category filters each time the picker opens, and
	// land on the tab that matches the marker's current icon: a building
	// recipe → Buildings, a settlement recipe → Settlement builder, a bare
	// settlement-kit icon (e.g. an imported marker's "settlement/town") →
	// Settlement builder too, and anything else → Icons.
	$effect(() => {
		if (open) {
			iconSearch = '';
			activeCategories = new Set();
			filtersOpen = false;
			const made = untrack(() => currentSettlement);
			const icon = untrack(() => currentIcon) ?? '';
			tab = made
				? made.building
					? 'buildings'
					: 'builder'
				: icon.startsWith('settlement/')
					? 'builder'
					: 'icons';
			lightbox = null;
		}
	});

	/** Focus what the tab is for: the search field, or "Use this". */
	function focusTab() {
		setTimeout(() => (tab === 'icons' ? iconSearchInputEl : useButton)?.focus(), 0);
	}

	// ─── Hover lightbox ─────────────────────────────────────────────────
	// Hovering a tile shows the icon enlarged beside it (tiles are ~48 px,
	// too small to judge a detailed settlement). Positioned in the dialog's
	// own coordinates (Dialog.Content is transformed, so `position: fixed`
	// children resolve against it) and clamped inside it.
	const LB = 176;
	let lightbox = $state<{ ic: MapIcon; x: number; y: number } | null>(null);
	let lbTimer: ReturnType<typeof setTimeout> | undefined;
	/** A real hover: a mouse, on a device that has one. On a phone a tap —
	 *  or the tile that lands under the finger as the dialog opens — can fire
	 *  an enter that iOS doesn't report as touch, and with no hover to end it
	 *  the lightbox stuck over the grid. */
	const hovers = (e: PointerEvent) =>
		e.pointerType === 'mouse' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
	function showLightbox(e: PointerEvent, ic: MapIcon) {
		if (!hovers(e) || !dialogEl) return;
		const tile = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const box = dialogEl.getBoundingClientRect();
		clearTimeout(lbTimer);
		lbTimer = setTimeout(() => {
			// Prefer the right of the tile, else the left; vertically centred.
			let x = tile.right - box.left + 8;
			if (x + LB > box.width - 8) x = tile.left - box.left - LB - 8;
			const y = Math.min(
				Math.max(tile.top - box.top + tile.height / 2 - LB / 2, 8),
				box.height - LB - 30,
			);
			lightbox = { ic, x: Math.max(8, x), y };
		}, 120);
	}
	function hideLightbox() {
		clearTimeout(lbTimer);
		lightbox = null;
	}

	function iconKey(i: MapIcon): string {
		return `${i.category}/${i.slug}`;
	}

	const filteredIcons = $derived.by<Record<string, MapIcon[]>>(() => {
		const q = iconSearch.trim().toLowerCase();
		const grouped: Record<string, MapIcon[]> = {};
		for (const cat of offeredCategories) grouped[cat] = [];
		for (const i of offeredIcons) {
			if (activeCategories.size > 0 && !activeCategories.has(i.category)) continue;
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
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay
			class="dialog-overlay mp-icon-overlay"
			style="z-index: {overlayZ(stackDepth)}"
		/>
		<Dialog.Content
			bind:ref={dialogEl}
			class="mp-icon-dialog"
			style="z-index: {contentZ(stackDepth)}"
			data-tour="icon-picker"
			onOpenAutoFocus={(e) => {
				// Focus the search input — or, on a builder tab, "Use this"
				// (CLAUDE.md focus rule).
				e.preventDefault();
				focusTab();
			}}
		>
			<DialogHeader
				title={headingText('Choose Icon')}
				onclose={() => onclose()}
				radius="8px 8px 0 0"
			/>
			<Tabs.Root
				class="mp-icon-tabs-root"
				bind:value={tab}
				onValueChange={() => {
					hideLightbox();
					focusTab();
				}}
			>
				<Tabs.List class="mp-icon-tabs">
					<Tabs.Trigger value="icons" class="mp-icon-tab">Icons</Tabs.Trigger>
					<Tabs.Trigger value="buildings" class="mp-icon-tab" data-tour="icon-tab-buildings"
						>Buildings</Tabs.Trigger
					>
					<Tabs.Trigger
						value="builder"
						class="mp-icon-tab"
						aria-label="Settlement builder"
						data-tour="icon-tab-builder"
					>
						<!-- Shortened on a phone so three tabs fit on one line. -->
						<span class="mp-icon-tab-long">Settlement builder</span>
						<span class="mp-icon-tab-short">Settlements</span>
					</Tabs.Trigger>
				</Tabs.List>
				<Tabs.Content value="icons" class="mp-icon-panel" data-tour="icon-icons">
					<div class="mp-icon-search-row">
						<FilterBar
							bind:search={iconSearch}
							bind:active={activeCategories}
							bind:filtersOpen
							bind:inputEl={iconSearchInputEl}
							categories={CATEGORY_CHIPS}
							placeholder="Search icons…"
						/>
					</div>
					<div class="mp-icon-body" onscroll={hideLightbox}>
						<!-- No "No icon" tile: whether a marker shows its icon is set by
						     the editor's Both / Label / Icon mode radios, not here. -->
						{#each Object.keys(filteredIcons) as cat (cat)}
							<div class="mp-icon-cat-label" style:--cat-color={CATEGORY_COLORS[cat]}>
								{filteredIcons[cat][0].categoryLabel}
							</div>
							<div class="mp-icon-grid">
								{#each filteredIcons[cat] as ic (iconKey(ic))}
									{@const key = iconKey(ic)}
									<button
										class="mp-icon-tile"
										class:mp-icon-tile-selected={currentIcon === key}
										onclick={() => onpick(key)}
										onpointerenter={(e) => showLightbox(e, ic)}
										onpointerleave={hideLightbox}
										aria-label={ic.label}
									>
										<svg viewBox={haloPaddedViewBox(ic)} aria-hidden="true">
											<!-- 'proportional' halo: the same contrast glow the marker
											     gets on the map (haloColor of the chosen colour — white
											     behind a dark icon, black behind a light one), but sized
											     to the icon so it doesn't read as a faint hairline at the
											     picker's larger tile size. Keeps every icon legible on
											     the tile's `--bg-control` background in both themes. -->
											{@html mapGlyphInner(ic, selectedColor, `pick-${key}`, 'proportional', 56)}
										</svg>
									</button>
								{/each}
							</div>
						{/each}
						{#if Object.keys(filteredIcons).length === 0}
							<p class="mp-icon-empty">No icons match "{iconSearch}".</p>
						{/if}
					</div>
				</Tabs.Content>
				<Tabs.Content
					value="buildings"
					class="mp-icon-panel mp-icon-body"
					data-tour="icon-buildings"
				>
					{#if open && tab === 'buildings'}
						<SettlementBuilder
							kind="building"
							color={selectedColor}
							initial={currentSettlement?.building ? currentSettlement : undefined}
							onuse={onpicksettlement}
							bind:useButton
						/>
					{/if}
				</Tabs.Content>
				<Tabs.Content value="builder" class="mp-icon-panel mp-icon-body" data-tour="icon-builder">
					{#if open && tab === 'builder'}
						<SettlementBuilder
							color={selectedColor}
							initial={currentSettlement?.building ? undefined : currentSettlement}
							onuse={onpicksettlement}
							bind:useButton
						/>
					{/if}
				</Tabs.Content>
			</Tabs.Root>
			{#if lightbox}
				<div
					class="mp-icon-lightbox"
					style="left: {lightbox.x}px; top: {lightbox.y}px; width: {LB}px"
					aria-hidden="true"
				>
					<svg viewBox={haloPaddedViewBox(lightbox.ic)}>
						{@html mapGlyphInner(lightbox.ic, selectedColor, 'pick-lightbox', 'proportional')}
					</svg>
					<span>{lightbox.ic.label}</span>
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	/* Icon picker sub-dialog — nested inside MapDialog. Overlay 84 /
	   content 85 sits ABOVE the marker-properties dialog (82/83) so
	   the icon grid stacks correctly when opened from the props
	   dialog's Icon button. Still one tier above nothing else in
	   the app so the shared modal budget stays intact. */
	/* z-index for .mp-icon-* is set inline by MapIconPicker via dialogStack. */
	:global(.mp-icon-dialog) {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		/* Match the outer MapDialog's mobile-bounds policy: 90 % of
		   the viewport on phone widths, 720 px capped on desktop. */
		width: min(720px, calc(100vw - 2rem));
		/* Fixed height (not max-height) so switching tabs, or a search that
		   empties the grid, never resizes the panel — it's centred via
		   translate(-50%, -50%), so any height change would rock it around
		   the viewport centre. The tab panels flex into the space.
		   In `dvh`, the viewport a phone actually shows: `vh` counts the
		   space under the browser's toolbars too, so a vh-tall picker ran
		   off the visible screen. (A bits-ui Dialog is a fixed div, not a
		   top-layer <dialog>, so dvh is safe here; vh is the fallback.) */
		height: 82vh;
		height: 82dvh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--bg-card);
		color: var(--text);
		border-radius: 8px;
		box-shadow:
			0 16px 48px #00000070,
			0 0 0 1px var(--border-mid);
		outline: none;
	}
	/* Search row modelled on FoePickerDialog's `.fd-search-*` — a
	   .field wrapper positions the magnifying-glass icon absolutely
	   over the left-inset padding of the input. */
	:global(.mp-icon-search-row) {
		padding: 8px 14px;
		background: var(--bg-inset);
		border-bottom: 1px solid var(--border);
	}
	:global(.mp-icon-tabs-root),
	:global(.mp-icon-panel) {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	:global(.mp-icon-panel[hidden]) {
		display: none;
	}
	:global(.mp-icon-body) {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 8px 14px 14px;
	}
	@media (max-width: 640px) {
		/* Give the picker room on phones — 90 % of the viewport,
		   matching the outer MapDialog's mobile bounds. */
		:global(.mp-icon-dialog) {
			width: 90vw;
			height: 90vh;
			height: 90dvh;
		}
	}
	:global(.mp-icon-cat-label) {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		/* Each section is tinted with its category colour (set inline as
		   --cat-color by MapIconPicker); "Label only" has none, so it falls
		   back to the neutral dimmer + border. */
		color: var(--cat-color, var(--text-dimmer));
		margin: 12px 0 6px;
		padding-bottom: 3px;
		border-bottom: 1px solid color-mix(in srgb, var(--cat-color, var(--border)) 35%, transparent);
	}
	:global(.mp-icon-cat-label:first-child) {
		margin-top: 0;
	}
	:global(.mp-icon-grid) {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
		gap: 4px;
	}
	:global(.mp-icon-tile) {
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
	:global(.mp-icon-tile:hover) {
		border-color: var(--text-accent);
	}
	:global(.mp-icon-tile-selected) {
		border-color: var(--text-accent);
		background: color-mix(in srgb, var(--text-accent) 12%, var(--bg-control));
	}
	:global(.mp-icon-tile svg) {
		width: 100%;
		height: 100%;
	}
	/* Icons | Settlement builder tabs — the underlined-tab pattern of the
	   Settings dialog (.sd-tab). */
	:global(.mp-icon-tabs) {
		display: flex;
		padding: 0 14px;
		border-bottom: 1px solid var(--border);
	}
	:global(.mp-icon-tab) {
		all: unset;
		cursor: pointer;
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		border-bottom: 2px solid transparent;
		padding: 8px 10px 6px;
		margin-bottom: -1px;
		white-space: nowrap;
	}
	:global(.mp-icon-tab-short) {
		display: none;
	}
	@media (max-width: 480px) {
		:global(.mp-icon-tab-long) {
			display: none;
		}
		:global(.mp-icon-tab-short) {
			display: inline;
		}
	}
	:global(.mp-icon-tab:hover) {
		color: var(--text-muted);
	}
	:global(.mp-icon-tab[data-state='active']) {
		color: var(--text-accent);
		border-bottom-color: var(--text-accent);
	}
	:global(.mp-icon-tab:focus-visible) {
		outline: 2px solid var(--text-accent);
		outline-offset: -2px;
	}
	/* Hover lightbox: the hovered tile's icon at a readable size. */
	:global(.mp-icon-lightbox) {
		position: fixed;
		pointer-events: none;
		z-index: 2;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 10px 10px 6px;
		background: var(--bg-card);
		border: 1px solid var(--border-mid);
		border-radius: 8px;
		box-shadow: 0 8px 24px #00000050;
	}
	:global(.mp-icon-lightbox svg) {
		width: 100%;
		aspect-ratio: 1 / 1;
	}
	:global(.mp-icon-lightbox span) {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text-muted);
		text-align: center;
	}
	:global(.mp-icon-empty) {
		font-family: var(--font-ui);
		font-size: 0.85rem;
		color: var(--text-dimmer);
		text-align: center;
		padding: 24px 0;
	}
</style>
