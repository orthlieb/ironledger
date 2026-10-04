<script lang="ts">
	/**
	 * MapIconPicker — the icon-chooser modal extracted out of MapDialog. Lists
	 * every manifest icon grouped by category with a live search filter and a
	 * "No icon" (label-only) tile; each tile previews in the marker's current
	 * colour. Purely presentational: it owns its own search state and reports
	 * the picked icon key back to MapDialog via `onpick`.
	 *
	 * Two tabs (bits-ui Tabs): Icons — the manifest grid, where hovering a
	 * tile lightboxes it at a readable size — and Settlement builder, which
	 * generates a settlement icon from a recipe (SettlementBuilder). Opening
	 * on a marker that already has a recipe lands on the builder.
	 *
	 * The `.mp-icon-*` styles live (as `:global`) in MapDialog's <style> — this
	 * component is only ever rendered by MapDialog, so those rules are always
	 * mounted and style this markup. (A future pass can move them here to make
	 * the component fully self-contained.)
	 */
	import { Dialog, Tabs } from 'bits-ui';
	import SettlementBuilder from '$lib/components/SettlementBuilder.svelte';
	import type { SettlementRecipe } from '$lib/settlementRecipe.js';
	import { pushDialog, popDialog, overlayZ, contentZ } from '$lib/dialogStack.svelte.js';
	import DialogHeader from '$lib/components/DialogHeader.svelte';
	import { headingText } from '$lib/fontStore.svelte.js';
	import { untrack } from 'svelte';
	import { tooltip } from '$lib/actions/tooltip.js';
	import {
		MAP_ICON_CATEGORIES,
		MAP_ICON_LIST,
		type MapIcon,
	} from '$lib/generated/mapIconManifest.js';
	import { mapGlyphInner, haloPaddedViewBox } from '$lib/mapConstants.js';
	import { isSourceEnabled } from '$lib/expansionStore.svelte.js';
	import FilterBar from '$lib/components/FilterBar.svelte';

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
		/** Called with the chosen icon manifest key ('' for the No-icon tile). */
		onpick: (key: string) => void;
		/** Called with the recipe the builder tab's "Use this" made. */
		onpicksettlement: (recipe: SettlementRecipe) => void;
		/** Called when the dialog is dismissed. */
		onclose: () => void;
	} = $props();

	let iconSearch = $state('');
	let iconSearchInputEl = $state<HTMLInputElement | null>(null);
	let activeCategories = $state(new Set<string>());
	let filtersOpen = $state(false);
	let stackDepth = $state(1);
	let tab = $state<'icons' | 'builder'>('icons');
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
	 *  (an extension's icons carry `source`). Markers already placed with a
	 *  disabled extension's icon keep rendering — this only gates picking. */
	const offeredIcons = $derived(
		MAP_ICON_LIST.filter((i) => !i.source || isSourceEnabled(i.source)),
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
	// land on the builder when the marker's icon is already generated.
	$effect(() => {
		if (open) {
			iconSearch = '';
			activeCategories = new Set();
			filtersOpen = false;
			tab = untrack(() => currentSettlement) ? 'builder' : 'icons';
			lightbox = null;
		}
	});

	/** Focus what the tab is for: the search field, or "Use this". */
	function focusTab() {
		setTimeout(() => (tab === 'builder' ? useButton : iconSearchInputEl)?.focus(), 0);
	}

	// ─── Hover lightbox ─────────────────────────────────────────────────
	// Hovering a tile shows the icon enlarged beside it (tiles are ~48 px,
	// too small to judge a detailed settlement). Positioned in the dialog's
	// own coordinates (Dialog.Content is transformed, so `position: fixed`
	// children resolve against it) and clamped inside it.
	const LB = 176;
	let lightbox = $state<{ ic: MapIcon; x: number; y: number } | null>(null);
	let lbTimer: ReturnType<typeof setTimeout> | undefined;
	function showLightbox(e: PointerEvent, ic: MapIcon) {
		if (e.pointerType === 'touch' || !dialogEl) return;
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
		<Dialog.Overlay class="mp-icon-overlay" style="z-index: {overlayZ(stackDepth)}" />
		<Dialog.Content
			bind:ref={dialogEl}
			class="mp-icon-dialog"
			style="z-index: {contentZ(stackDepth)}"
			onOpenAutoFocus={(e) => {
				// Focus the search input — or, on the builder tab, "Use this"
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
					<Tabs.Trigger value="builder" class="mp-icon-tab">Settlement builder</Tabs.Trigger>
				</Tabs.List>
				<Tabs.Content value="icons" class="mp-icon-panel">
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
						<!-- "No icon" tile always at the top — clicking it clears the
					     marker's icon so only the label renders (centred on the point).
					     Rendered outside the filtered loop with no --cat-color, so it
					     stays neutral and is always shown regardless of the filters. -->
						<div class="mp-icon-cat-label">Label only</div>
						<div class="mp-icon-grid">
							<button
								class="mp-icon-tile mp-icon-tile--none"
								class:mp-icon-tile-selected={currentIcon === '' || currentIcon == null}
								onclick={() => onpick('')}
								use:tooltip={'Show only the label — no icon, centred on the point'}
								aria-label="No icon"
							>
								<span class="mp-icon-none-glyph" aria-hidden="true">Aa</span>
							</button>
						</div>
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
											{@html mapGlyphInner(ic, selectedColor, `pick-${key}`, 'proportional')}
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
				<Tabs.Content value="builder" class="mp-icon-panel mp-icon-body">
					{#if open && tab === 'builder'}
						<SettlementBuilder
							color={selectedColor}
							initial={currentSettlement}
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
