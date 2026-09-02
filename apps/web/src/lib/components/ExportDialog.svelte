<script lang="ts">
	/**
	 * ExportDialog — comprehensive export as a familiar filter + checklist.
	 *
	 * One search field filters every exportable item at once; a "Select all"
	 * checkbox in the upper-left toggles all *currently-filtered* rows. Below,
	 * a single scrolling checklist groups items under collapsible category
	 * headers (Characters, Expeditions, Connections, Maps, Session Log); each
	 * header carries a tri-state checkbox that selects/clears its whole group.
	 * A Zip / Markdown segment and a live summary complete it. On Export it
	 * emits an `ExportSelection`; the home route assembles the payload.
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
	import charactersIconSvg from '$icons/Characters.svg?raw';
	import expeditionsIconSvg from '$icons/Expeditions.svg?raw';
	import villageIconSvg from '$icons/village.svg?raw';
	import treasureMapIconSvg from '$icons/treasure-map.svg?raw';
	import logIconSvg from '$icons/log.svg?raw';

	const CHECK =
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>';
	const CARET =
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';

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

	type Item = {
		key: string;
		cat: Cat;
		sub?: 'community' | 'npc' | 'place';
		id: string;
		name: string;
		tag?: string;
	};
	type Cat = 'char' | 'exp' | 'conn' | 'map' | 'log';
	type Category = {
		key: Cat;
		label: string;
		icon: string;
		color: string;
		atomic?: boolean;
		items: Item[];
	};

	const catalog = $derived<Category[]>([
		{
			key: 'char',
			label: 'Characters',
			icon: charactersIconSvg,
			color: '#5aa467',
			items: chars.map((c) => ({
				key: `char:${c.id}`,
				cat: 'char',
				id: c.id,
				name: c.name || 'Unnamed',
			})),
		},
		{
			key: 'exp',
			label: 'Expeditions',
			icon: expeditionsIconSvg,
			color: '#e4aa28',
			items: exps.map((e) => ({
				key: `exp:${e.id}`,
				cat: 'exp',
				id: e.id,
				name: e.name || 'Unnamed',
				tag: e.type,
			})),
		},
		{
			key: 'conn',
			label: 'Connections',
			icon: villageIconSvg,
			color: '#d06840',
			items: [
				...comms.map((c) => ({
					key: `conn:community:${c.id}`,
					cat: 'conn' as const,
					sub: 'community' as const,
					id: c.id,
					name: c.name || 'Unnamed',
					tag: 'community',
				})),
				...npcsL.map((n) => ({
					key: `conn:npc:${n.id}`,
					cat: 'conn' as const,
					sub: 'npc' as const,
					id: n.id,
					name: n.name || 'Unnamed',
					tag: 'npc',
				})),
				...placesL.map((p) => ({
					key: `conn:place:${p.id}`,
					cat: 'conn' as const,
					sub: 'place' as const,
					id: p.id,
					name: p.name || 'Unnamed',
					tag: 'place',
				})),
			],
		},
		{
			key: 'map',
			label: 'Maps',
			icon: treasureMapIconSvg,
			color: '#3e9cb5',
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
			icon: logIconSvg,
			color: '#a46fb0',
			atomic: true,
			items:
				logEntries.length > 0
					? [{ key: 'log', cat: 'log', id: 'all', name: `${logEntries.length} entries` }]
					: [],
		},
	]);

	// ── search + selection ────────────────────────────────────────────────────
	let q = $state('');
	let sel = $state(new Set<string>());
	let openCats = $state(new Set<Cat>());
	let format = $state<'zip' | 'md'>('zip');
	let touched = $state(false);
	let exportBtnEl = $state<HTMLButtonElement | null>(null);
	let searchEl = $state<HTMLInputElement | null>(null);

	const query = $derived(q.trim().toLowerCase());
	function matches(item: Item): boolean {
		if (!query) return true;
		if (item.name.toLowerCase().includes(query)) return true;
		if (item.tag?.toLowerCase().includes(query)) return true;
		if (item.cat === 'log' && 'session log entries'.includes(query)) return true;
		return false;
	}
	// Categories with their filtered items; empty categories drop out while a
	// search is active but stay (empty) otherwise so the structure is stable.
	const view = $derived(
		catalog
			.map((c) => ({ ...c, items: c.items.filter(matches) }))
			.filter(
				(c) => c.items.length > 0 || (!query && c.items.length === 0 && rawCount(c.key) === 0),
			),
	);
	function rawCount(cat: Cat): number {
		return catalog.find((c) => c.key === cat)?.items.length ?? 0;
	}

	const filteredItems = $derived(view.flatMap((c) => c.items));
	const filteredKeys = $derived(filteredItems.map((i) => i.key));
	const allItemKeys = $derived(catalog.flatMap((c) => c.items.map((i) => i.key)));
	const itemByKey = $derived(new Map(catalog.flatMap((c) => c.items).map((i) => [i.key, i])));

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
			format = 'zip';
			touched = false;
			openCats = new Set(catalog.map((c) => c.key));
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
	function toggleCat(cat: Cat) {
		const c = view.find((x) => x.key === cat);
		if (c) toggleKeys(c.items.map((i) => i.key));
	}
	function toggleCollapse(cat: Cat) {
		const n = new Set(openCats);
		if (n.has(cat)) n.delete(cat);
		else n.add(cat);
		openCats = n;
	}

	const anySelected = $derived(selectedCount > 0);
	const isEverything = $derived(allItemKeys.length > 0 && allItemKeys.every((k) => sel.has(k)));

	function idsOf(cat: Cat, sub?: Item['sub']): string[] {
		return [...sel]
			.map((k) => itemByKey.get(k))
			.filter((i): i is Item => !!i && i.cat === cat && (sub ? i.sub === sub : true))
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
				<input
					bind:this={searchEl}
					class="exd-search"
					type="search"
					placeholder="Search everything…"
					aria-label="Search items to export"
					bind:value={q}
				/>
				<button
					type="button"
					class="exd-selectall"
					aria-pressed={selectAllState === 'on'}
					onclick={() => toggleKeys(filteredKeys)}
				>
					<span class="exd-cb" data-state={selectAllState} aria-hidden="true">{@html CHECK}</span>
					<span class="exd-selectall-label"
						>Select all{query ? ` (${filteredItems.length} shown)` : ''}</span
					>
					<span class="exd-selectall-count">{selectedCount} selected</span>
				</button>
			</div>

			<div class="exd-list">
				{#each view as cat (cat.key)}
					{@const catKeys = cat.items.map((i) => i.key)}
					{@const catState = triOf(catKeys)}
					{#if cat.atomic}
						<!-- Session Log — atomic; the header row is the toggle. -->
						<button type="button" class="exd-cathead exd-atomic" onclick={() => toggleCat(cat.key)}>
							<span class="exd-cb" data-state={catState} aria-hidden="true">{@html CHECK}</span>
							<span class="exd-swatch" style="--cat:{cat.color}" aria-hidden="true"
								>{@html cat.icon}</span
							>
							<span class="exd-cathead-label">{cat.label}</span>
							<span class="exd-count">{cat.items[0]?.name ?? '—'}</span>
						</button>
					{:else}
						<div class="exd-group" class:open={openCats.has(cat.key)}>
							<div class="exd-cathead">
								<button
									type="button"
									class="exd-cbwrap"
									onclick={() => toggleCat(cat.key)}
									aria-label={`Select all ${cat.label}`}
								>
									<span class="exd-cb" data-state={catState} aria-hidden="true">{@html CHECK}</span>
								</button>
								<span class="exd-swatch" style="--cat:{cat.color}" aria-hidden="true"
									>{@html cat.icon}</span
								>
								<button
									type="button"
									class="exd-cathead-main"
									onclick={() => toggleCollapse(cat.key)}
								>
									<span class="exd-cathead-label">{cat.label}</span>
									<span class="exd-count">{cat.items.length}</span>
								</button>
								<button
									type="button"
									class="exd-caret"
									onclick={() => toggleCollapse(cat.key)}
									aria-label={openCats.has(cat.key) ? 'Collapse' : 'Expand'}>{@html CARET}</button
								>
							</div>
							{#if openCats.has(cat.key)}
								<div class="exd-items">
									{#each cat.items as item (item.key)}
										<button type="button" class="exd-item" onclick={() => toggleItem(item.key)}>
											<span
												class="exd-cb sm"
												data-state={sel.has(item.key) ? 'on' : 'off'}
												aria-hidden="true">{@html CHECK}</span
											>
											<span class="exd-item-name"
												>{item.name}{#if item.tag}<span class="exd-tag">{item.tag}</span>{/if}</span
											>
										</button>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				{/each}
				{#if view.length === 0}
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
				<button type="button" class="exd-btn" onclick={() => (open = false)}>Cancel</button>
				<button
					type="button"
					class="exd-btn primary"
					bind:this={exportBtnEl}
					disabled={!anySelected}
					onclick={doExport}
				>
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
		max-height: 88dvh;
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
	:global(.exd-search) {
		font: inherit;
		font-size: 13px;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 7px;
		padding: 8px 11px;
		color: var(--text);
	}
	:global(.exd-search::placeholder) {
		color: var(--text-dimmer);
	}
	:global(.exd-search:focus-visible) {
		outline: 2px solid var(--text-accent);
		outline-offset: 1px;
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
	:global(.exd-group) {
		border-radius: 8px;
	}
	:global(.exd-cathead) {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 8px;
		border-radius: 8px;
	}
	:global(.exd-cathead:hover),
	:global(.exd-atomic:hover) {
		background: var(--bg-hover);
	}
	:global(.exd-atomic) {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		background: transparent;
		border: 0;
		cursor: pointer;
		color: var(--text);
		font: inherit;
		text-align: left;
	}
	:global(.exd-cathead-main) {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 8px;
		background: transparent;
		border: 0;
		padding: 0;
		cursor: pointer;
		color: var(--text);
		font: inherit;
		text-align: left;
	}
	:global(.exd-cathead-label) {
		font-weight: 600;
		font-size: 13.5px;
		flex: 1;
	}

	:global(.exd-cbwrap) {
		border: 0;
		background: transparent;
		padding: 0;
		cursor: pointer;
		display: grid;
		place-items: center;
		flex: none;
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

	:global(.exd-swatch) {
		width: 28px;
		height: 28px;
		border-radius: 8px;
		display: grid;
		place-items: center;
		flex: none;
		color: var(--cat);
		background: color-mix(in srgb, var(--cat) 15%, var(--bg-card));
		border: 1px solid color-mix(in srgb, var(--cat) 32%, transparent);
	}
	:global(.exd-swatch svg) {
		width: 17px;
		height: 17px;
		fill: currentColor;
	}

	:global(.exd-count) {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		font-size: 12px;
		color: var(--text-muted);
		background: var(--bg-control);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 2px 9px;
		white-space: nowrap;
		flex: none;
	}

	:global(.exd-caret) {
		border: 0;
		background: transparent;
		color: var(--text-dimmer);
		cursor: pointer;
		padding: 4px;
		border-radius: 6px;
		flex: none;
		display: grid;
		place-items: center;
		transition: transform 0.16s ease;
	}
	:global(.exd-caret svg) {
		width: 13px;
		height: 13px;
	}
	:global(.exd-group.open .exd-caret) {
		transform: rotate(90deg);
		color: var(--text-muted);
	}

	:global(.exd-items) {
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: 0 8px 6px 46px;
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
	:global(.exd-btn) {
		font: inherit;
		font-size: 13.5px;
		font-weight: 500;
		border-radius: 8px;
		padding: 9px 16px;
		cursor: pointer;
		border: 1px solid var(--border-mid);
		background: var(--bg-control);
		color: var(--text);
	}
	:global(.exd-btn:hover) {
		background: var(--bg-hover);
	}
	:global(.exd-btn.primary) {
		background: var(--text-accent);
		border-color: var(--text-accent);
		color: var(--bg-page);
	}
	:global(.exd-btn.primary:disabled) {
		opacity: 0.45;
		cursor: not-allowed;
	}
</style>
