<script lang="ts">
	/**
	 * MapIconPicker — the icon-chooser modal extracted out of MapDialog. Lists
	 * every manifest icon grouped by category with a live search filter and a
	 * "No icon" (label-only) tile; each tile previews in the marker's current
	 * colour. Purely presentational: it owns its own search state and reports
	 * the picked icon key back to MapDialog via `onpick`.
	 *
	 * The `.mp-icon-*` styles live (as `:global`) in MapDialog's <style> — this
	 * component is only ever rendered by MapDialog, so those rules are always
	 * mounted and style this markup. (A future pass can move them here to make
	 * the component fully self-contained.)
	 */
	import { Dialog } from 'bits-ui';
	import DialogHeader from '$lib/components/DialogHeader.svelte';
	import { headingText } from '$lib/fontStore.svelte.js';
	import { tooltip } from '$lib/actions/tooltip.js';
	import {
		MAP_ICON_CATEGORIES,
		MAP_ICON_LIST,
		type MapIcon,
	} from '$lib/generated/mapIconManifest.js';
	import { mapGlyphInner } from '$lib/mapConstants.js';
	import searchIconSvg from '$icons/magnifying-glass-solid-full.svg?raw';

	let {
		open = $bindable(false),
		selectedColor,
		currentIcon,
		onpick,
		onclose,
	}: {
		/** Two-way: MapDialog opens it; Escape/outside-click closes it. */
		open?: boolean;
		/** Fill colour for the tile previews (the marker's current colour). */
		selectedColor: string;
		/** The marker's current icon key, for the selected-tile highlight. */
		currentIcon: string | null | undefined;
		/** Called with the chosen icon manifest key ('' for the No-icon tile). */
		onpick: (key: string) => void;
		/** Called when the dialog is dismissed. */
		onclose: () => void;
	} = $props();

	let iconSearch = $state('');
	let iconSearchInputEl = $state<HTMLInputElement | null>(null);

	// Reset the search filter each time the picker opens.
	$effect(() => {
		if (open) iconSearch = '';
	});

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
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="mp-icon-overlay" />
		<Dialog.Content
			class="mp-icon-dialog"
			onOpenAutoFocus={(e) => {
				// Focus the search input on open (CLAUDE.md focus rule).
				e.preventDefault();
				setTimeout(() => iconSearchInputEl?.focus(), 0);
			}}
		>
			<DialogHeader
				title={headingText('Choose Icon')}
				onclose={() => onclose()}
				radius="8px 8px 0 0"
			/>
			<div class="mp-icon-search-row">
				<div class="mp-icon-search-field">
					<span class="mp-icon-search-icon" aria-hidden="true">{@html searchIconSvg}</span>
					<input
						id="mp-icon-search"
						name="mp-icon-search"
						bind:this={iconSearchInputEl}
						class="mp-icon-search"
						type="search"
						placeholder="Search icons…"
						bind:value={iconSearch}
						aria-label="Search icons"
					/>
				</div>
			</div>
			<div class="mp-icon-body">
				<!-- "No icon" tile always at the top — clicking it clears the
			     marker's icon so only the label renders (centred on the point). -->
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
					<div class="mp-icon-cat-label">{filteredIcons[cat][0].categoryLabel}</div>
					<div class="mp-icon-grid">
						{#each filteredIcons[cat] as ic (iconKey(ic))}
							{@const key = iconKey(ic)}
							<button
								class="mp-icon-tile"
								class:mp-icon-tile-selected={currentIcon === key}
								onclick={() => onpick(key)}
								use:tooltip={ic.label}
								aria-label={ic.label}
							>
								<svg viewBox={ic.viewBox} aria-hidden="true">
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
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
