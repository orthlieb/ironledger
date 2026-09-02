<script lang="ts">
	/**
	 * ExportDialog — comprehensive export as a familiar filter + checklist.
	 *
	 * A single flat, searchable checklist of every exportable item — like the
	 * Moves/Oracles pickers, but with a checkbox per row for multi-select. A
	 * search field plus sub-type filter pills (Sites / Scenes / Journeys,
	 * Communities / Places / NPCs, Characters, Maps, Session Log) narrow the
	 * list; a "Select all" checkbox in the upper-left toggles all
	 * *currently-filtered* rows. Each row carries its bare entity icon + type
	 * tag so it is self-identifying. A Zip / Markdown segment and a live summary
	 * complete it. On Export it emits an `ExportSelection`; the home route
	 * assembles the payload.
	 *
	 * Reads the entity stores directly for the item lists and calls `initMap()`
	 * on open for the maps. Styles are `:global` because bits-ui portals
	 * Dialog.Content out of this component's scope.
	 */
	import { untrack } from 'svelte';
	import { Dialog, ToggleGroup } from 'bits-ui';
	import DialogHeader from './DialogHeader.svelte';
	import { headingText } from '$lib/fontStore.svelte.js';
	import { getCharacters } from '$lib/characterStore.svelte.js';
	import { getExpeditions } from '$lib/expeditionStore.svelte.js';
	import { getCommunities } from '$lib/communityStore.svelte.js';
	import { getNpcs } from '$lib/npcStore.svelte.js';
	import { getPlaces } from '$lib/placeStore.svelte.js';
	import { mapListState, initMap } from '$lib/mapStore.svelte.js';
	import { sessionLog } from '$lib/log.svelte.js';
	import type { ExportSelection } from '$lib/exportSelection.js';
	import { ENTITY_KIND_META } from '$lib/entityKinds.js';
	import charactersIconSvg from '$icons/Characters.svg?raw';
	import treasureMapIconSvg from '$icons/treasure-map.svg?raw';
	import logIconSvg from '$icons/log.svg?raw';
	import searchIconSvg from '$icons/magnifying-glass-solid-full.svg?raw';
	import clearFiltersSvg from '$icons/filter-circle-xmark-solid-full.svg?raw';
	import { tooltip } from '$lib/actions/tooltip.js';

	const CHECK =
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>';

	let {
		open = $bindable(false),
		onexport,
	}: {
		open?: boolean;
		onexport: (sel: ExportSelection) => void;
	} = $props();

	// ── live data ───────────────────────────────────────────────────────────
	const chars = $derived(getCharacters());
	const exps = $derived(getExpeditions());
	const comms = $derived(getCommunities());
	const npcsL = $derived(getNpcs());
	const placesL = $derived(getPlaces());
	const maps = $derived(mapListState.maps);
	const logEntries = $derived(sessionLog.entries);

	type Cat = 'char' | 'exp' | 'conn' | 'map' | 'log';
	type Item = {
		key: string;
		cat: Cat;
		sub?: 'community' | 'npc' | 'place';
		id: string;
		name: string;
		tag?: string;
	};
	// A facet is one filter pill = one sub-type: Characters, each expedition
	// type (Sites / Scenes / Journeys), each connection kind (Communities /
	// Places / NPCs), Maps, Session Log. Each carries its own entity icon +
	// colour, which its rows inherit so the flat list is self-identifying.
	type Facet = { key: string; label: string; color: string; icon: string; items: Item[] };
	const K = ENTITY_KIND_META;

	const facets = $derived<Facet[]>([
		{
			key: 'char',
			label: 'Characters',
			color: '#5aa467',
			icon: charactersIconSvg,
			items: chars.map((c) => ({
				key: `char:${c.id}`,
				cat: 'char',
				id: c.id,
				name: c.name || 'Unnamed',
			})),
		},
		{
			key: 'exp:site',
			label: 'Sites',
			color: K.site.color,
			icon: K.site.icon,
			items: exps
				.filter((e) => e.type === 'site')
				.map((e) => ({
					key: `exp:${e.id}`,
					cat: 'exp',
					id: e.id,
					name: e.name || 'Unnamed',
					tag: 'site',
				})),
		},
		{
			key: 'exp:scene',
			label: 'Scenes',
			color: K.scene.color,
			icon: K.scene.icon,
			items: exps
				.filter((e) => e.type === 'scene')
				.map((e) => ({
					key: `exp:${e.id}`,
					cat: 'exp',
					id: e.id,
					name: e.name || 'Unnamed',
					tag: 'scene',
				})),
		},
		{
			key: 'exp:journey',
			label: 'Journeys',
			color: K.journey.color,
			icon: K.journey.icon,
			items: exps
				.filter((e) => e.type === 'journey')
				.map((e) => ({
					key: `exp:${e.id}`,
					cat: 'exp',
					id: e.id,
					name: e.name || 'Unnamed',
					tag: 'journey',
				})),
		},
		{
			key: 'conn:community',
			label: 'Communities',
			color: K.community.color,
			icon: K.community.icon,
			items: comms.map((c) => ({
				key: `conn:community:${c.id}`,
				cat: 'conn',
				sub: 'community',
				id: c.id,
				name: c.name || 'Unnamed',
				tag: 'community',
			})),
		},
		{
			key: 'conn:place',
			label: 'Places',
			color: K.place.color,
			icon: K.place.icon,
			items: placesL.map((p) => ({
				key: `conn:place:${p.id}`,
				cat: 'conn',
				sub: 'place',
				id: p.id,
				name: p.name || 'Unnamed',
				tag: 'place',
			})),
		},
		{
			key: 'conn:npc',
			label: 'NPCs',
			color: K.npc.color,
			icon: K.npc.icon,
			items: npcsL.map((n) => ({
				key: `conn:npc:${n.id}`,
				cat: 'conn',
				sub: 'npc',
				id: n.id,
				name: n.name || 'Unnamed',
				tag: 'npc',
			})),
		},
		{
			key: 'map',
			label: 'Maps',
			color: '#3e9cb5',
			icon: treasureMapIconSvg,
			items: maps.map((m) => ({
				key: `map:${m.id}`,
				cat: 'map',
				id: m.id,
				name: m.name || 'Untitled Map',
			})),
		},
		{
			key: 'log',
			label: 'Session Log',
			color: '#a46fb0',
			icon: logIconSvg,
			items:
				logEntries.length > 0
					? [{ key: 'log', cat: 'log', id: 'all', name: `${logEntries.length} entries` }]
					: [],
		},
	]);

	// ── search + selection ────────────────────────────────────────────────────
	let q = $state('');
	let sel = $state(new Set<string>());
	let activeFacets = $state(new Set<string>());
	let filtersOpen = $state(false);
	let format = $state<'zip' | 'md'>('zip');
	let touched = $state(false);
	let searchEl = $state<HTMLInputElement | null>(null);

	const query = $derived(q.trim().toLowerCase());
	function matches(item: Item): boolean {
		if (!query) return true;
		if (item.name.toLowerCase().includes(query)) return true;
		if (item.tag?.toLowerCase().includes(query)) return true;
		if (item.cat === 'log' && 'session log entries'.includes(query)) return true;
		return false;
	}
	// One flat list of every item (facet order), each carrying its facet's
	// icon/colour + key so a row is self-identifying without section headers —
	// a single searchable checklist like the Moves/Oracles pickers.
	type Row = Item & { icon: string; color: string; facet: string };
	const allItems = $derived<Row[]>(
		facets.flatMap((f) =>
			f.items.map((i) => ({ ...i, icon: f.icon, color: f.color, facet: f.key })),
		),
	);
	// Sub-type filter pills narrow the list to the chosen facets (empty = all);
	// the search narrows further. `filtered` (and therefore Select all) always
	// reflects both.
	const pillFacets = $derived(facets.filter((f) => f.items.length > 0));
	const filtered = $derived(
		allItems.filter((i) => (activeFacets.size === 0 || activeFacets.has(i.facet)) && matches(i)),
	);
	const filteredKeys = $derived(filtered.map((i) => i.key));
	const allItemKeys = $derived(allItems.map((i) => i.key));
	const itemByKey = $derived(new Map(allItems.map((i) => [i.key, i])));

	type Tri = 'on' | 'off' | 'mixed';
	function triOf(keys: string[]): Tri {
		if (keys.length === 0) return 'off';
		const n = keys.filter((k) => sel.has(k)).length;
		return n === 0 ? 'off' : n === keys.length ? 'on' : 'mixed';
	}
	const selectAllState = $derived(triOf(filteredKeys));
	const selectedCount = $derived(sel.size);

	// Reset filter/format on open; seed "everything" (and keep following the
	// catalog while untouched, so late-loading maps join the default set).
	$effect(() => {
		if (!open) return;
		void initMap().catch(() => {});
		untrack(() => {
			q = '';
			activeFacets = new Set();
			filtersOpen = false;
			format = 'zip';
			touched = false;
		});
	});
	$effect(() => {
		if (open && !touched) sel = new Set(allItemKeys);
	});

	// ── toggles ─────────────────────────────────────────────────────────────
	function commit(next: Set<string>) {
		touched = true;
		sel = next;
	}
	function toggleItem(key: string) {
		const n = new Set(sel);
		if (n.has(key)) n.delete(key);
		else n.add(key);
		commit(n);
	}
	function toggleKeys(keys: string[]) {
		const all = keys.length > 0 && keys.every((k) => sel.has(k));
		const n = new Set(sel);
		if (all) keys.forEach((k) => n.delete(k));
		else keys.forEach((k) => n.add(k));
		commit(n);
	}
	function togglePill(facet: string) {
		const n = new Set(activeFacets);
		if (n.has(facet)) n.delete(facet);
		else n.add(facet);
		activeFacets = n;
	}
	function clearFilters() {
		activeFacets = new Set();
	}
	const anySelected = $derived(selectedCount > 0);
	const isEverything = $derived(allItemKeys.length > 0 && allItemKeys.every((k) => sel.has(k)));

	function idsOf(cat: Cat, sub?: Item['sub']): string[] {
		return [...sel]
			.map((k) => itemByKey.get(k))
			.filter((i): i is Row => !!i && i.cat === cat && (sub ? i.sub === sub : true))
			.map((i) => i.id);
	}

	function doExport() {
		if (!anySelected) return;
		onexport({
			characters: idsOf('char'),
			expeditions: idsOf('exp'),
			communities: idsOf('conn', 'community'),
			npcs: idsOf('conn', 'npc'),
			places: idsOf('conn', 'place'),
			maps: idsOf('map'),
			log: sel.has('log'),
			format,
		});
		open = false;
	}

	// summary: "N characters · M connections · …"
	const summaryParts = $derived.by(() => {
		const p: string[] = [];
		const chN = idsOf('char').length;
		const exN = idsOf('exp').length;
		const coN = idsOf('conn').length;
		const maN = idsOf('map').length;
		if (chN) p.push(`${chN} character${chN === 1 ? '' : 's'}`);
		if (exN) p.push(`${exN} expedition${exN === 1 ? '' : 's'}`);
		if (coN) p.push(`${coN} connection${coN === 1 ? '' : 's'}`);
		if (maN) p.push(`${maN} map${maN === 1 ? '' : 's'}`);
		if (sel.has('log')) p.push(`${logEntries.length} log entries`);
		return p;
	});
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="exd-overlay" />
		<Dialog.Content
			class="exd-dialog"
			onOpenAutoFocus={(e) => {
				// Focus the search field on open (CLAUDE.md focus rule: search-first).
				e.preventDefault();
				setTimeout(() => searchEl?.focus(), 0);
			}}
		>
			<DialogHeader
				title={headingText('Export')}
				onclose={() => (open = false)}
				radius="10px 10px 0 0"
			/>

			<div class="exd-toolbar">
				<div class="exd-search-row">
					<div class="exd-search-field">
						<span class="exd-search-icon" aria-hidden="true">{@html searchIconSvg}</span>
						<input
							bind:this={searchEl}
							class="exd-search"
							type="search"
							placeholder="Search everything…"
							aria-label="Search items to export"
							bind:value={q}
						/>
					</div>
					{#if pillFacets.length > 1}
						<button
							type="button"
							class="exd-filter-toggle"
							class:active={activeFacets.size > 0}
							onclick={() => (filtersOpen = !filtersOpen)}
							aria-expanded={filtersOpen}
							>Filters{#if activeFacets.size > 0}&nbsp;<span class="exd-filter-badge"
									>{activeFacets.size}</span
								>{/if}
							{filtersOpen ? '▲' : '▼'}</button
						>
					{/if}
				</div>
				{#if filtersOpen && pillFacets.length > 1}
					<div class="exd-filter-panel">
						<div class="exd-pills" role="group" aria-label="Filter by type">
							{#each pillFacets as f (f.key)}
								<button
									type="button"
									class="exd-pill"
									class:active={activeFacets.has(f.key)}
									style="--ccolor:{f.color}"
									aria-pressed={activeFacets.has(f.key)}
									onclick={() => togglePill(f.key)}
								>
									{f.label} <span class="exd-pill-n">{f.items.length}</span>
								</button>
							{/each}
						</div>
						<button
							type="button"
							class="exd-clear"
							onclick={clearFilters}
							disabled={activeFacets.size === 0}
							use:tooltip={'Clear all filters'}
							aria-label="Clear all filters">{@html clearFiltersSvg}</button
						>
					</div>
				{/if}
				<button
					type="button"
					class="exd-selectall"
					aria-pressed={selectAllState === 'on'}
					onclick={() => toggleKeys(filteredKeys)}
				>
					<span class="exd-cb" data-state={selectAllState} aria-hidden="true">{@html CHECK}</span>
					<span class="exd-selectall-label"
						>Select all{filtered.length < allItems.length
							? ` (${filtered.length} shown)`
							: ''}</span
					>
					<span class="exd-selectall-count">{selectedCount} selected</span>
				</button>
			</div>

			<div class="exd-list">
				{#each filtered as item (item.key)}
					<button type="button" class="exd-item" onclick={() => toggleItem(item.key)}>
						<span class="exd-cb sm" data-state={sel.has(item.key) ? 'on' : 'off'} aria-hidden="true"
							>{@html CHECK}</span
						>
						<span class="exd-rowicon" style="--cat:{item.color}" aria-hidden="true"
							>{@html item.icon}</span
						>
						<span class="exd-item-name"
							>{item.name}{#if item.tag}<span class="exd-tag">{item.tag}</span>{/if}</span
						>
					</button>
				{/each}
				{#if filtered.length === 0}
					<p class="exd-empty">No items match “{q}”.</p>
				{/if}
			</div>

			<div class="exd-fmt">
				<ToggleGroup.Root
					type="single"
					value={format}
					onValueChange={(v) => v && (format = v as 'zip' | 'md')}
					class="exd-seg"
					aria-label="Export format"
				>
					<ToggleGroup.Item value="zip" class="exd-segbtn">
						<strong>Zip archive</strong>
						<span>Complete · re-importable · images &amp; map art</span>
					</ToggleGroup.Item>
					<ToggleGroup.Item value="md" class="exd-segbtn">
						<strong>Markdown</strong>
						<span>Readable · not re-importable · adds foe bestiary</span>
					</ToggleGroup.Item>
				</ToggleGroup.Root>
			</div>

			<div class="exd-summary">
				{#if !anySelected}
					<span class="exd-sum-lead">Nothing selected</span>
				{:else if isEverything}
					<span class="exd-sum-lead">Everything</span>
					<span class="exd-sum-detail">— a complete backup</span>
				{:else}
					<span class="exd-sum-lead">{selectedCount} items</span>
					<span class="exd-sum-detail">— {summaryParts.join(' · ')}</span>
				{/if}
			</div>

			<div class="exd-footer">
				<button type="button" class="btn" onclick={() => (open = false)}>Cancel</button>
				<button type="button" class="btn btn-primary" disabled={!anySelected} onclick={doExport}>
					{isEverything ? 'Export Everything' : 'Export Selection'}
				</button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.exd-overlay) {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 80;
	}
	:global(.exd-dialog) {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(94vw, 460px);
		/* Fixed height so filtering (which changes the item count) never resizes
		   the dialog and makes it jump as it re-centres — the list scrolls
		   inside instead. */
		height: min(640px, 88dvh);
		display: flex;
		flex-direction: column;
		background: var(--bg-card);
		border: 1px solid var(--border-mid);
		border-radius: 10px;
		box-shadow: 0 22px 60px -14px rgba(0, 0, 0, 0.7);
		z-index: 81;
		overflow: hidden;
	}

	/* toolbar: search + select-all */
	:global(.exd-toolbar) {
		padding: 10px 12px 6px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		border-bottom: 1px solid var(--border);
	}
	:global(.exd-search-row) {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	:global(.exd-search-field) {
		flex: 1;
		min-width: 0;
		position: relative;
		display: flex;
		align-items: center;
	}
	:global(.exd-filter-toggle) {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 5px 11px;
		border-radius: 999px;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text-dimmer);
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 5px;
		flex: none;
		transition:
			border-color 0.1s,
			color 0.1s;
	}
	:global(.exd-filter-toggle:hover) {
		color: var(--text-muted);
		border-color: var(--border-mid);
	}
	:global(.exd-filter-toggle.active) {
		color: var(--text-accent);
		border-color: color-mix(in srgb, var(--text-accent) 50%, var(--border));
	}
	:global(.exd-filter-badge) {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		font-size: 0.66rem;
		background: var(--text-accent);
		color: var(--bg-page);
		border-radius: 999px;
		padding: 0 5px;
		line-height: 1.5;
	}
	:global(.exd-filter-panel) {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	:global(.exd-clear) {
		flex: none;
		background: transparent;
		border: 0;
		color: var(--text-dimmer);
		cursor: pointer;
		padding: 3px;
		border-radius: 6px;
		display: grid;
		place-items: center;
	}
	:global(.exd-clear:hover:not(:disabled)) {
		color: var(--text-accent);
	}
	:global(.exd-clear:disabled) {
		opacity: 0.35;
		cursor: default;
	}
	:global(.exd-clear svg) {
		width: 15px;
		height: 15px;
		fill: currentColor;
	}
	:global(.exd-search-icon) {
		position: absolute;
		left: 8px;
		width: 13px;
		height: 13px;
		display: inline-flex;
		pointer-events: none;
		color: var(--text-dimmer);
	}
	:global(.exd-search-icon svg) {
		width: 13px;
		height: 13px;
		fill: currentColor;
	}
	:global(.exd-search) {
		flex: 1;
		min-width: 0;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text);
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 5px 8px 5px 28px;
	}
	:global(.exd-search::placeholder) {
		color: var(--text-dimmer);
	}
	:global(.exd-pills) {
		flex: 1;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	:global(.exd-pill) {
		font-family: var(--font-ui);
		font-size: 0.66rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--ccolor, var(--text-dimmer));
		background: transparent;
		border: 1px solid color-mix(in srgb, var(--ccolor, var(--border)) 40%, transparent);
		border-radius: 999px;
		padding: 3px 10px;
		cursor: pointer;
		white-space: nowrap;
		display: inline-flex;
		align-items: center;
		gap: 5px;
		transition:
			background 0.12s,
			border-color 0.12s;
	}
	:global(.exd-pill:hover) {
		background: color-mix(in srgb, var(--ccolor) 12%, transparent);
	}
	:global(.exd-pill.active) {
		background: color-mix(in srgb, var(--ccolor) 18%, transparent);
		border-color: var(--ccolor);
	}
	:global(.exd-pill-n) {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		opacity: 0.8;
	}

	:global(.exd-selectall) {
		display: flex;
		align-items: center;
		gap: 10px;
		background: transparent;
		border: 0;
		padding: 4px 2px;
		cursor: pointer;
		color: var(--text);
		font: inherit;
		text-align: left;
	}
	:global(.exd-selectall-label) {
		font-weight: 600;
		font-size: 13px;
	}
	:global(.exd-selectall-count) {
		margin-left: auto;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		font-size: 12px;
		color: var(--text-muted);
	}

	/* checklist */
	:global(.exd-list) {
		padding: 4px 6px 6px;
		overflow-y: auto;
		overscroll-behavior: contain;
		flex: 1;
	}
	:global(.exd-cb) {
		width: 20px;
		height: 20px;
		border-radius: 6px;
		border: 1.75px solid var(--border-mid);
		background: var(--bg-control);
		display: grid;
		place-items: center;
		position: relative;
	}
	:global(.exd-cb.sm) {
		width: 17px;
		height: 17px;
		border-radius: 5px;
	}
	:global(.exd-cb svg) {
		width: 13px;
		height: 13px;
		color: var(--bg-page);
		opacity: 0;
	}
	:global(.exd-cb.sm svg) {
		width: 11px;
		height: 11px;
	}
	:global(.exd-cb[data-state='on']),
	:global(.exd-cb[data-state='mixed']) {
		background: var(--text-accent);
		border-color: var(--text-accent);
	}
	:global(.exd-cb[data-state='on'] svg) {
		opacity: 1;
	}
	:global(.exd-cb[data-state='mixed']::after) {
		content: '';
		width: 9px;
		height: 2.5px;
		border-radius: 2px;
		background: var(--bg-page);
	}

	/* Bare entity icon (no rounded-rectangle chrome), tinted to its sub-type —
	   like the entity combobox lists items. */
	:global(.exd-rowicon) {
		width: 20px;
		height: 20px;
		display: grid;
		place-items: center;
		flex: none;
		color: var(--cat);
	}
	:global(.exd-rowicon svg) {
		width: 18px;
		height: 18px;
		fill: currentColor;
	}

	:global(.exd-item) {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 8px;
		border-radius: 7px;
		cursor: pointer;
		border: 0;
		background: transparent;
		color: var(--text);
		font: inherit;
		text-align: left;
		width: 100%;
	}
	:global(.exd-item:hover) {
		background: var(--bg-hover);
	}
	:global(.exd-item-name) {
		flex: 1;
		font-size: 13px;
	}
	:global(.exd-tag) {
		font-size: 10px;
		color: var(--text-dimmer);
		margin-left: 6px;
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 0 5px;
		text-transform: capitalize;
	}
	:global(.exd-empty) {
		font-size: 12.5px;
		color: var(--text-dimmer);
		text-align: center;
		padding: 24px 0;
		margin: 0;
	}

	/* format */
	:global(.exd-fmt) {
		padding: 8px 12px 10px;
		border-top: 1px solid var(--border);
	}
	:global(.exd-seg) {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 9px;
		padding: 4px;
	}
	:global(.exd-segbtn) {
		font: inherit;
		border: 0;
		background: transparent;
		color: var(--text-muted);
		padding: 8px 10px;
		border-radius: 6px;
		cursor: pointer;
		text-align: left;
	}
	:global(.exd-segbtn strong) {
		display: block;
		color: var(--text);
		font-weight: 500;
		font-size: 13.5px;
	}
	:global(.exd-segbtn span) {
		display: block;
		font-size: 10.5px;
		margin-top: 1px;
	}
	:global(.exd-segbtn[data-state='on']) {
		background: var(--bg-card);
		outline: 1.5px solid color-mix(in srgb, var(--text-accent) 45%, transparent);
	}
	:global(.exd-segbtn[data-state='on'] strong) {
		color: var(--text-accent);
	}

	:global(.exd-summary) {
		display: flex;
		align-items: baseline;
		gap: 6px;
		flex-wrap: wrap;
		padding: 11px 14px;
		border-top: 1px solid var(--border);
		background: var(--bg-inset);
		font-size: 12.5px;
		color: var(--text-muted);
	}
	:global(.exd-sum-lead) {
		color: var(--text);
		font-weight: 500;
	}

	:global(.exd-footer) {
		display: flex;
		gap: 10px;
		justify-content: flex-end;
		padding: 12px 14px;
		background: var(--bg-card);
		border-top: 1px solid var(--border);
	}
	/* Cancel / Export use the app's standard .btn / .btn-primary (app.css). */
</style>
