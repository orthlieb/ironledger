<script lang="ts">
	/**
	 * CommunitiesArea (v2 prototype) — combined Communities + NPCs deck.
	 *
	 * Master-detail: a searchable/filterable rail lists both entry types
	 * interleaved; selecting one opens its detail in the stage. The rail
	 * scales to dozens of entries (search + type filter + Added/A–Z sort).
	 * On narrow widths the two panes collapse to a single-pane drill-down
	 * (list → detail → back) via a viewport @media query (≤600px).
	 * Each entry's row accent and stage-header LHS band are coloured by type:
	 *   community → #D06840 (terracotta)
	 *   npc       → #C848A8 (orchid)
	 *
	 * Header toolbar adds "+ Community" and "+ NPC" (both open V1 random /
	 * manual dialogs with oracle pickers).
	 *
	 * Two tabs per entry:
	 *   • CORE — community: region / location / desc / trouble
	 *            npc:       role / goal / descriptor / relationship / location
	 *   • NOTES — portrait floats right, markdown notes wrap around it.
	 *
	 * All edits flow through a 1.5 s debounce shared between both stores.
	 */
	import {
		getCommunities,
		isCommunityLoading,
		persistCommunitiesNow,
		addCommunity,
		removeCommunity,
	} from '$lib/communityStore.svelte.js';
	import { getNpcs, persistNpcsNow, addNpc, removeNpc } from '$lib/npcStore.svelte.js';
	import type { Community, Npc, NpcRelationship } from '$lib/types.js';
	import MarkdownNotes from '$lib/components/MarkdownNotes.svelte';
	import PortraitUploader from '$lib/components/PortraitUploader.svelte';
	import { EditableName } from '$lib/editableName.svelte.js';
	import { isYrtEnabled } from '$lib/expansionStore.svelte.js';
	import {
		loadOracles,
		getOracles,
		rollOracle,
		findOracle,
		rollFromRangeTable,
	} from '$lib/oracleStore.svelte.js';
	import { appendLog } from '$lib/log.svelte.js';
	import { animateDice, DIE_BLACK, DIE_WHITE } from '$lib/dice.js';
	import { tooltip } from '$lib/actions/tooltip.js';

	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import trashSvg from '$icons/trash-solid-full.svg?raw';
	import hutSvg from '$icons/hut.svg?raw';
	import farmerSvg from '$icons/farmer.svg?raw';
	import villageIconSvg from '$icons/village.svg?raw';
	import diceD6Svg from '$icons/dice-d6-light.svg?raw';
	import searchIconSvg from '$icons/magnifying-glass-solid-full.svg?raw';
	import clearFiltersSvg from '$icons/filter-circle-xmark-solid-full.svg?raw';
	import sortAzSvg from '$icons/arrow-down-a-z-solid-full.svg?raw';
	import sortAddedSvg from '$icons/calendar-arrow-down-solid-full.svg?raw';
	import { headingText } from '$lib/fontStore.svelte.js';

	let { showTitle = true }: { showTitle?: boolean } = $props();

	const COMMUNITY_COLOR = '#D06840';
	const NPC_COLOR = '#C848A8';

	type EntryKind = 'community' | 'npc';
	type CommunityEntry = { kind: 'community'; id: string; createdAt: number; data: Community };
	type NpcEntry = { kind: 'npc'; id: string; createdAt: number; data: Npc };
	type Entry = CommunityEntry | NpcEntry;

	type CmTab = 'core' | 'notes';
	const TAB_LABELS: { key: CmTab; label: string }[] = [
		{ key: 'core', label: 'Core' },
		{ key: 'notes', label: 'Description' },
	];

	const RELATIONSHIPS: { value: NpcRelationship; label: string }[] = [
		{ value: 'bond', label: 'Bond' },
		{ value: 'neutral', label: 'Neutral' },
		{ value: 'foe', label: 'Foe' },
	];

	let activeEntryId = $state<string | null>(null);
	let activeTab = $state<CmTab>('core');
	let deleteDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let newlyCreatedId = $state('');

	// Rail controls — search box, type filter, and sort order. These scale the
	// list to dozens of entries (see displayEntries below). Filter + sort
	// persist per-browser so the rail reopens the way you left it.
	const FILTER_KEY = 'ironledger:connections:filter';
	const SORT_KEY = 'ironledger:connections:sort';
	function readFilter(): 'all' | EntryKind {
		if (typeof window === 'undefined') return 'all';
		const v = localStorage.getItem(FILTER_KEY);
		return v === 'community' || v === 'npc' ? v : 'all';
	}
	function readSort(): 'added' | 'name' {
		if (typeof window === 'undefined') return 'added';
		return localStorage.getItem(SORT_KEY) === 'name' ? 'name' : 'added';
	}
	let search = $state('');
	let kindFilter = $state<'all' | EntryKind>(readFilter());
	let sortMode = $state<'added' | 'name'>(readSort());
	let filtersOpen = $state(false);
	const activeFilterCount = $derived(kindFilter === 'all' ? 0 : 1);

	// Persist filter + sort to localStorage whenever they change.
	$effect(() => {
		if (typeof window === 'undefined') return;
		localStorage.setItem(FILTER_KEY, kindFilter);
		localStorage.setItem(SORT_KEY, sortMode);
	});

	// Mobile/narrow drill-down: which pane is showing when the area is too
	// narrow for two panes (driven by the viewport @media query in the styles).
	// Selecting an entry pushes to 'detail'; the back button returns to 'list'.
	let mobilePane = $state<'list' | 'detail'>('list');

	// New-community dialog state
	let newCommunityDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let _pendingCommunity: Community | null = null;
	let _pendingCommunityRegionType = $state<'ironlands' | 'yrt'>('ironlands');
	let _pendingCommunityLocationType = $state<'location' | 'coastalWatersLocation'>('location');

	// New-NPC dialog state
	let newNpcDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let _pendingNpc: Npc | null = null;
	let _pendingNpcNameOracle = $state<string>('namesIronlander');

	// Inline-edit state
	let editingNotes = $state(false);
	let editingCoreNotes = $state(false);

	// Re-entrance guard for dice-button rolls (matches ExpeditionsArea pattern).
	let rolling = $state(false);
	const nameEdit = new EditableName((restored) => {
		if (activeEntry?.kind === 'community') updateCommunity({ name: restored });
		else if (activeEntry?.kind === 'npc') updateNpc({ name: restored });
	});

	const communities = $derived(getCommunities());
	const npcs = $derived(getNpcs());
	const loading = $derived(isCommunityLoading());

	/** Combined list — communities + NPCs, sorted by createdAt (oldest first). */
	const entries = $derived<Entry[]>(
		[
			...communities.map<CommunityEntry>((c) => ({
				kind: 'community',
				id: c.id,
				createdAt: c.createdAt ?? 0,
				data: c,
			})),
			...npcs.map<NpcEntry>((n) => ({
				kind: 'npc',
				id: n.id,
				createdAt: n.createdAt ?? 0,
				data: n,
			})),
		].sort((a, b) => a.createdAt - b.createdAt),
	);

	/** Rail list — entries after type filter + name search, then sorted. The
	 *  detail stage always reads from the full `entries`, so filtering the rail
	 *  never hides the currently-open entry. */
	const displayEntries = $derived<Entry[]>(
		entries
			.filter((e) => kindFilter === 'all' || e.kind === kindFilter)
			.filter((e) => {
				const q = search.trim().toLowerCase();
				return q === '' || (e.data.name ?? '').toLowerCase().includes(q);
			})
			.sort((a, b) => {
				if (sortMode === 'name') {
					return (a.data.name ?? '').localeCompare(b.data.name ?? '', undefined, {
						sensitivity: 'base',
					});
				}
				return a.createdAt - b.createdAt;
			}),
	);

	$effect(() => {
		if (!activeEntryId && entries.length > 0) activeEntryId = entries[0].id;
	});

	const activeEntry = $derived(entries.find((e) => e.id === activeEntryId));
	const activeKind = $derived<EntryKind | null>(activeEntry?.kind ?? null);
	const activeColor = $derived(activeKind === 'npc' ? NPC_COLOR : COMMUNITY_COLOR);

	function selectEntry(id: string) {
		flushPersist();
		activeEntryId = id;
		activeTab = 'core';
		mobilePane = 'detail';
		nameEdit.commit();
		editingNotes = false;
		editingCoreNotes = false;
	}

	// ── Direct-proxy writes + debounced API flush ─────────────────────────
	// updateCommunity/updateNpc mutate fields on the active entry's data
	// object (a $state proxy from the store array). Identity is preserved
	// so anything binding to it stays in sync. A single $effect watches
	// the active entry's snapshot and schedules a kind-aware flush that
	// pushes the right store (communities vs npcs) to the API.
	let _saveTimer: ReturnType<typeof setTimeout> | null = null;
	let _savingKind: EntryKind | null = null;

	function updateCommunity(patch: Partial<Community>) {
		if (activeEntry?.kind !== 'community') return;
		Object.assign(activeEntry.data as object, patch);
	}
	function updateNpc(patch: Partial<Npc>) {
		if (activeEntry?.kind !== 'npc') return;
		Object.assign(activeEntry.data as object, patch);
	}

	/** Roll on the Settlement Trouble oracle, animate the d100, log the
	 *  outcome, then apply it to the active community — mirrors the pattern
	 *  used by ExpeditionsArea.rollFeature / rollDanger. */
	async function rollSettlementTrouble() {
		if (activeEntry?.kind !== 'community' || rolling) return;
		rolling = true;
		try {
			const result = rollOracle('settlementTrouble', getOracles());
			if (!result.value) return;
			const tensV = Math.floor((result.roll % 100) / 10) || 10;
			const onesV = result.roll % 10 || 10;
			await animateDice([
				{ sides: 10, value: tensV, color: DIE_BLACK },
				{ sides: 10, value: onesV, color: DIE_WHITE },
			]);
			appendLog(
				result.title,
				`<div class="roll-line">Roll: d100 → ${result.roll}</div>` +
					`<div>Result: <strong>${result.value}</strong></div>`,
			);
			updateCommunity({ trouble: result.value });
		} finally {
			rolling = false;
		}
	}

	$effect(() => {
		if (!activeEntry) return;
		const kind = activeEntry.kind;
		$state.snapshot(activeEntry.data);
		// If the pending save targets a different store, flush it first so
		// we don't lose a Community edit by overwriting the timer with an NPC edit.
		if (_saveTimer && _savingKind && _savingKind !== kind) flushPersist();
		_savingKind = kind;
		if (_saveTimer) clearTimeout(_saveTimer);
		_saveTimer = setTimeout(() => {
			const k = _savingKind;
			_saveTimer = null;
			_savingKind = null;
			const p = k === 'npc' ? persistNpcsNow() : persistCommunitiesNow();
			p.catch((err) => console.error('[v2] save failed', err));
		}, 1500);
		return () => {
			if (_saveTimer) {
				clearTimeout(_saveTimer);
				const k = _savingKind;
				_saveTimer = null;
				_savingKind = null;
				const p = k === 'npc' ? persistNpcsNow() : persistCommunitiesNow();
				p.catch((err) => console.error('[v2] save failed', err));
			}
		};
	});

	function flushPersist() {
		if (_saveTimer) {
			clearTimeout(_saveTimer);
			const k = _savingKind;
			_saveTimer = null;
			_savingKind = null;
			const p = k === 'npc' ? persistNpcsNow() : persistCommunitiesNow();
			p.catch((err) => console.error('[v2] save failed', err));
		}
	}

	function setName(value: string) {
		if (activeEntry?.kind === 'community') updateCommunity({ name: value });
		else if (activeEntry?.kind === 'npc') updateNpc({ name: value });
	}
	function setNotes(value: string) {
		if (activeEntry?.kind === 'community') updateCommunity({ notes: value });
		else if (activeEntry?.kind === 'npc') updateNpc({ notes: value });
	}
	function setSituationalNotes(value: string) {
		if (activeEntry?.kind === 'community') updateCommunity({ situationalNotes: value });
		else if (activeEntry?.kind === 'npc') updateNpc({ situationalNotes: value });
	}

	// ── Add Community / NPC (V1 random-or-manual pattern) ──────────────────
	async function addNewCommunity() {
		_pendingCommunity = {
			id: crypto.randomUUID(),
			name: 'New Community',
			region: '',
			location: '',
			locationDescription: '',
			trouble: '',
			notes: '',
			createdAt: Date.now(),
		};
		await loadOracles();
		newCommunityDialogRef?.open();
	}

	async function _commitCommunity(random: boolean) {
		if (!_pendingCommunity) return;
		const c = _pendingCommunity;
		_pendingCommunity = null;
		if (random) {
			const oracles = getOracles();
			const nameOracle = Math.random() < 0.5 ? 'settlementName' : 'settlementNameQuick';
			const nameVal = rollOracle(nameOracle, oracles).value;
			if (nameVal) c.name = nameVal;
			c.region =
				_pendingCommunityRegionType === 'yrt'
					? rollOracle('yrtRegion', oracles).value
					: rollOracle('region', oracles).value;
			c.location = rollOracle(_pendingCommunityLocationType, oracles).value;
			c.locationDescription = rollOracle('locationDescriptor', oracles).value;
			c.trouble = rollOracle('settlementTrouble', oracles).value;
		}
		await addCommunity(c);
		activeEntryId = c.id;
		newlyCreatedId = c.id;
		activeTab = 'core';
		setTimeout(() => (newlyCreatedId = ''), 0);
	}

	async function addNewNpc() {
		_pendingNpc = {
			id: crypto.randomUUID(),
			name: 'New NPC',
			role: '',
			goal: '',
			descriptor: '',
			relationship: 'neutral',
			location: '',
			notes: '',
			createdAt: Date.now(),
		};
		await loadOracles();
		newNpcDialogRef?.open();
	}

	async function _commitNpc(random: boolean) {
		if (!_pendingNpc) return;
		const n = _pendingNpc;
		_pendingNpc = null;
		if (random) {
			const oracles = getOracles();
			n.role = rollOracle('characterRole', oracles).value;
			n.goal = rollOracle('characterGoal', oracles).value;
			n.descriptor = rollOracle('characterDescriptor', oracles).value;
			if (_pendingNpcNameOracle.startsWith('namesOther_')) {
				const o = findOracle('namesOther');
				if (o) {
					const r = rollFromRangeTable(o.data);
					const v = r.value as { giants: string; varou: string; trolls: string };
					const sub = _pendingNpcNameOracle.split('_')[1] as keyof typeof v;
					n.name = v[sub];
				}
			} else {
				const o = findOracle(_pendingNpcNameOracle);
				if (o) n.name = rollFromRangeTable(o.data).value as string;
			}
		}
		await addNpc(n);
		activeEntryId = n.id;
		newlyCreatedId = n.id;
		activeTab = 'core';
		setTimeout(() => (newlyCreatedId = ''), 0);
	}

	async function confirmDeleteEntry() {
		if (!activeEntry) return;
		const id = activeEntry.id;
		if (activeEntry.kind === 'community') await removeCommunity(id);
		else await removeNpc(id);
		if (activeEntryId === id) activeEntryId = null;
		// Return to the list on narrow layouts after deleting the open entry.
		mobilePane = 'list';
	}
</script>

<div class="cm-area" class:cm-area--detail={mobilePane === 'detail'}>
	<header class="cm-header">
		<!-- Back button — only shown in the mobile single-pane drill-down
		     (viewport ≤600px and a detail entry is open). Lives on the toolbar
		     rather than the stage header. -->
		<button
			class="btn cm-hdr-btn back-btn cm-header-back"
			type="button"
			onclick={() => (mobilePane = 'list')}>Back</button
		>
		{#if showTitle}
			<span class="cm-title-icon" aria-hidden="true">{@html villageIconSvg}</span>
			<span class="cmt-title">{headingText('Connections')}</span>
		{/if}
		<div class="cm-header-actions">
			<button class="btn cm-hdr-btn" onclick={addNewCommunity} use:tooltip={'Add community'}
				>+ Community</button
			>
			<button class="btn cm-hdr-btn" onclick={addNewNpc} use:tooltip={'Add NPC'}>+ NPC</button>
		</div>
	</header>

	{#if loading}
		<div class="cm-loading">Loading…</div>
	{:else if entries.length === 0}
		<div class="cm-empty">
			<span class="cm-empty-icon" aria-hidden="true">{@html villageIconSvg}</span>
			<p class="cm-empty-text">
				There are people and places to <s>plunder</s> discover. Click <strong>+ COMMUNITY</strong>
				or <strong>+ NPC</strong> to begin.
			</p>
		</div>
	{:else}
		<div class="cm-body" class:cm-body--detail={mobilePane === 'detail'}>
			<nav class="cm-rail" aria-label="Connections and NPCs">
				<div class="cm-rail-tools">
					<div class="cm-search">
						<span class="cm-search-icon" aria-hidden="true">{@html searchIconSvg}</span>
						<input
							class="cm-search-input"
							type="search"
							bind:value={search}
							placeholder="Search connections…"
							aria-label="Search connections"
						/>
					</div>
					<div class="cm-rail-filters">
						<button
							class="cm-filter-toggle"
							class:has-filters={activeFilterCount > 0}
							aria-expanded={filtersOpen}
							onclick={() => (filtersOpen = !filtersOpen)}
							>Filters{#if activeFilterCount > 0}&nbsp;<span class="cm-filter-badge"
									>{activeFilterCount}</span
								>{/if}
							{filtersOpen ? '▲' : '▼'}</button
						>
						<button
							class="cm-sort-toggle"
							aria-label={sortMode === 'name'
								? 'Sorted A–Z. Switch to most recently added.'
								: 'Sorted by most recently added. Switch to A–Z.'}
							use:tooltip={sortMode === 'name' ? 'Sorted A–Z' : 'Sorted by recently added'}
							onclick={() => (sortMode = sortMode === 'name' ? 'added' : 'name')}
							>{@html sortMode === 'name' ? sortAzSvg : sortAddedSvg}</button
						>
					</div>
					{#if filtersOpen}
						<div class="cm-filter-panel">
							<div class="cm-filter-group">
								<span class="cm-filter-group-label">Type</span>
								<div class="cm-filter-chips" role="group" aria-label="Filter by type">
									<button
										class="cm-filter-tag"
										class:active={kindFilter === 'all'}
										aria-pressed={kindFilter === 'all'}
										onclick={() => (kindFilter = 'all')}>All</button
									>
									<button
										class="cm-filter-tag"
										class:active={kindFilter === 'community'}
										aria-pressed={kindFilter === 'community'}
										style="--tag-color: {COMMUNITY_COLOR}"
										onclick={() => (kindFilter = 'community')}>Communities</button
									>
									<button
										class="cm-filter-tag"
										class:active={kindFilter === 'npc'}
										aria-pressed={kindFilter === 'npc'}
										style="--tag-color: {NPC_COLOR}"
										onclick={() => (kindFilter = 'npc')}>NPCs</button
									>
								</div>
							</div>
							<button
								class="cm-clear-btn"
								onclick={() => (kindFilter = 'all')}
								disabled={activeFilterCount === 0}
								use:tooltip={'Clear all filters'}
								aria-label="Clear filters">{@html clearFiltersSvg}</button
							>
						</div>
					{/if}
				</div>

				<div class="cm-list" aria-label="Connections">
					{#each displayEntries as entry (entry.id)}
						{@const accent = entry.kind === 'npc' ? NPC_COLOR : COMMUNITY_COLOR}
						<button
							class="cm-row"
							class:cm-row--active={entry.id === activeEntryId}
							style="--cm-row-color: {accent}"
							aria-current={entry.id === activeEntryId ? 'true' : undefined}
							onclick={() => selectEntry(entry.id)}
						>
							<span class="cm-row-icon" aria-hidden="true"
								>{@html entry.kind === 'npc' ? farmerSvg : hutSvg}</span
							>
							<span class="cm-row-name"
								>{entry.data.name ||
									(entry.kind === 'npc' ? 'Unnamed NPC' : 'Unnamed Community')}</span
							>
							<span class="cm-row-badge">{entry.kind === 'npc' ? 'NPC' : 'Community'}</span>
						</button>
					{:else}
						<p class="cm-list-empty">No connections match “{search}”.</p>
					{/each}
				</div>
			</nav>

			{#if activeEntry}
				<div class="cm-stage-header" style="--cm-nature: {activeColor}">
					<span class="cm-stage-icon" aria-hidden="true"
						>{@html activeEntry.kind === 'npc' ? farmerSvg : hutSvg}</span
					>
					{#if nameEdit.editing}
						<input
							bind:this={nameEdit.inputEl}
							class="cm-stage-name-input"
							type="text"
							value={activeEntry.data.name}
							placeholder={activeEntry.kind === 'npc' ? 'NPC name…' : 'Community name…'}
							oninput={(e) => setName((e.target as HTMLInputElement).value)}
							onblur={nameEdit.commit}
							onkeydown={nameEdit.onKeydown}
						/>
					{:else}
						<button
							type="button"
							class="cm-stage-name cm-stage-name--editable"
							use:tooltip={'Click to rename'}
							onclick={() => nameEdit.start(activeEntry.data.name)}
							>{headingText(
								activeEntry.data.name ||
									(activeEntry.kind === 'npc' ? 'Unnamed NPC' : 'Unnamed Community'),
							)}</button
						>
					{/if}
					<button
						class="btn btn-icon icon-btn btn-trash cm-stage-delete-btn"
						onclick={() => deleteDialogRef?.open()}
						use:tooltip={activeEntry.kind === 'npc' ? 'Delete NPC' : 'Delete community'}
						aria-label={activeEntry.kind === 'npc' ? 'Delete NPC' : 'Delete community'}
						>{@html trashSvg}</button
					>
				</div>

				<div class="cm-stage">
					<div class="cm-tabs" role="tablist">
						{#each TAB_LABELS as tab (tab.key)}
							<button
								role="tab"
								class="cm-tab"
								class:cm-tab--active={activeTab === tab.key}
								aria-selected={activeTab === tab.key}
								onclick={() => (activeTab = tab.key)}>{tab.label}</button
							>
						{/each}
					</div>

					<div class="cm-card" role="tabpanel">
						{#if activeTab === 'core'}
							{#if activeEntry.kind === 'community'}
								{@const c = activeEntry.data}
								<div class="cm-field-row">
									<label class="cm-field-label" for="cm-region-{c.id}">Region</label>
									<input
										id="cm-region-{c.id}"
										class="cm-input"
										type="text"
										value={c.region}
										oninput={(e) =>
											updateCommunity({ region: (e.target as HTMLInputElement).value })}
										placeholder="Region…"
									/>
								</div>
								<div class="cm-field-row">
									<label class="cm-field-label" for="cm-location-{c.id}">Location</label>
									<input
										id="cm-location-{c.id}"
										class="cm-input"
										type="text"
										value={c.location}
										oninput={(e) =>
											updateCommunity({ location: (e.target as HTMLInputElement).value })}
										placeholder="Location…"
									/>
								</div>
								<div class="cm-field-row">
									<label class="cm-field-label" for="cm-locdesc-{c.id}">Description</label>
									<input
										id="cm-locdesc-{c.id}"
										class="cm-input"
										type="text"
										value={c.locationDescription}
										oninput={(e) =>
											updateCommunity({
												locationDescription: (e.target as HTMLInputElement).value,
											})}
										placeholder="Location description…"
									/>
								</div>
								<div class="cm-field-row cm-field-row--trouble">
									<label class="cm-field-label" for="cm-trouble-{c.id}">Trouble</label>
									<input
										id="cm-trouble-{c.id}"
										class="cm-input"
										type="text"
										value={c.trouble}
										oninput={(e) =>
											updateCommunity({ trouble: (e.target as HTMLInputElement).value })}
										placeholder="Settlement trouble…"
									/>
									<button
										class="cm-dice-btn"
										type="button"
										onclick={rollSettlementTrouble}
										disabled={rolling}
										use:tooltip={'Roll settlement trouble oracle'}
										aria-label="Roll settlement trouble oracle">{@html diceD6Svg}</button
									>
								</div>
							{:else}
								{@const n = activeEntry.data}
								<div class="cm-field-row">
									<label class="cm-field-label" for="cm-role-{n.id}">Role</label>
									<input
										id="cm-role-{n.id}"
										class="cm-input"
										type="text"
										value={n.role}
										oninput={(e) => updateNpc({ role: (e.target as HTMLInputElement).value })}
										placeholder="Role…"
									/>
								</div>
								<div class="cm-field-row">
									<label class="cm-field-label" for="cm-goal-{n.id}">Goal</label>
									<input
										id="cm-goal-{n.id}"
										class="cm-input"
										type="text"
										value={n.goal}
										oninput={(e) => updateNpc({ goal: (e.target as HTMLInputElement).value })}
										placeholder="Goal…"
									/>
								</div>
								<div class="cm-field-row">
									<label class="cm-field-label" for="cm-desc-{n.id}">Descriptor</label>
									<input
										id="cm-desc-{n.id}"
										class="cm-input"
										type="text"
										value={n.descriptor}
										oninput={(e) => updateNpc({ descriptor: (e.target as HTMLInputElement).value })}
										placeholder="Descriptor…"
									/>
								</div>
								<div class="cm-field-row">
									<label class="cm-field-label" for="cm-rel-{n.id}">Relationship</label>
									<select
										id="cm-rel-{n.id}"
										class="cm-input"
										value={n.relationship}
										onchange={(e) =>
											updateNpc({
												relationship: (e.target as HTMLSelectElement).value as NpcRelationship,
											})}
									>
										{#each RELATIONSHIPS as r}
											<option value={r.value}>{r.label}</option>
										{/each}
									</select>
								</div>
								<div class="cm-field-row">
									<label class="cm-field-label" for="cm-loc-{n.id}">Location</label>
									<input
										id="cm-loc-{n.id}"
										class="cm-input"
										type="text"
										value={n.location}
										oninput={(e) => updateNpc({ location: (e.target as HTMLInputElement).value })}
										placeholder="Location…"
									/>
								</div>
							{/if}

							<!-- Situational notes — short notes about current conditions,
							     separate from the long-form Description (notes) field. While
							     editing, the block grows to fill the rest of the Core panel. -->
							<div class="cm-core-notes" class:cm-core-notes--editing={editingCoreNotes}>
								<span class="cm-field-label cm-core-notes-label">Notes</span>
								<MarkdownNotes
									bind:editing={editingCoreNotes}
									value={activeEntry.data.situationalNotes ?? ''}
									oninput={(v) => setSituationalNotes(v)}
									placeholder={activeEntry.kind === 'npc'
										? 'Situational notes about this NPC…'
										: 'Situational notes — conditions, or aspects of the trouble…'}
									rows={4}
								/>
							</div>
						{:else if activeTab === 'notes'}
							<div class="cm-notes-section" class:cm-notes-section--editing={editingNotes}>
								<!-- Portrait floats right and the prose wraps around it; it's
								     hidden while editing so the textarea fills the whole panel. -->
								{#if !editingNotes}
									<PortraitUploader
										value={activeEntry.data.imageUrl ?? ''}
										oninput={(v) => {
											if (activeEntry?.kind === 'community') updateCommunity({ imageUrl: v });
											else if (activeEntry?.kind === 'npc') updateNpc({ imageUrl: v });
										}}
										placeholderSvg={activeEntry.kind === 'npc' ? farmerSvg : hutSvg}
										alt={activeEntry.data.name}
									/>
								{/if}

								<MarkdownNotes
									bind:editing={editingNotes}
									value={activeEntry.data.notes ?? ''}
									oninput={(v) => setNotes(v)}
									placeholder={activeEntry.kind === 'npc'
										? 'Description of this NPC…'
										: 'Description of this community…'}
									rows={6}
								/>
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

{#if activeEntry}
	<ConfirmDialog
		bind:this={deleteDialogRef}
		title={activeEntry.kind === 'npc' ? 'Delete NPC' : 'Delete Community'}
		confirmLabel="Delete"
		onconfirm={confirmDeleteEntry}
	>
		<p>
			Permanently delete <strong
				>{activeEntry.data.name ||
					(activeEntry.kind === 'npc' ? 'this NPC' : 'this community')}</strong
			>? This cannot be undone.
		</p>
	</ConfirmDialog>
{/if}

<!-- New Community dialog — V1 pattern. -->
<ConfirmDialog
	bind:this={newCommunityDialogRef}
	title="New Community"
	confirmLabel="Random"
	confirmClass="btn-primary"
	showCancelButton={false}
	alternateLabel="Create"
	accentColor={COMMUNITY_COLOR}
	onconfirm={() => _commitCommunity(true)}
	onalternate={() => _commitCommunity(false)}
	ondismiss={() => {
		_pendingCommunity = null;
	}}
>
	<p
		style="font-family: var(--font-ui); font-size: 0.8rem; color: var(--text-muted); margin: 0 0 10px;"
	>
		Generate fields randomly using oracles, or create the community manually?
	</p>
	<div style="display: flex; gap: 20px; align-items: flex-start;">
		<fieldset style="border: none; padding: 0; margin: 0;">
			<legend
				style="font-family: var(--font-ui); font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dimmer); margin-bottom: 5px;"
				>Region oracle</legend
			>
			<label
				style="display: flex; align-items: center; gap: 6px; font-family: var(--font-ui); font-size: 0.78rem; color: var(--text); cursor: pointer; margin-bottom: 4px;"
			>
				<input type="radio" bind:group={_pendingCommunityRegionType} value="ironlands" /> Ironlands
			</label>
			{#if isYrtEnabled()}
				<label
					style="display: flex; align-items: center; gap: 6px; font-family: var(--font-ui); font-size: 0.78rem; color: var(--text); cursor: pointer;"
				>
					<input type="radio" bind:group={_pendingCommunityRegionType} value="yrt" /> YRT
				</label>
			{/if}
		</fieldset>
		<fieldset style="border: none; padding: 0; margin: 0;">
			<legend
				style="font-family: var(--font-ui); font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dimmer); margin-bottom: 5px;"
				>Location oracle</legend
			>
			<label
				style="display: flex; align-items: center; gap: 6px; font-family: var(--font-ui); font-size: 0.78rem; color: var(--text); cursor: pointer; margin-bottom: 4px;"
			>
				<input type="radio" bind:group={_pendingCommunityLocationType} value="location" /> Inland
			</label>
			<label
				style="display: flex; align-items: center; gap: 6px; font-family: var(--font-ui); font-size: 0.78rem; color: var(--text); cursor: pointer;"
			>
				<input
					type="radio"
					bind:group={_pendingCommunityLocationType}
					value="coastalWatersLocation"
				/> Coastal Waters
			</label>
		</fieldset>
	</div>
</ConfirmDialog>

<!-- New NPC dialog — V1 pattern with name-oracle selector. -->
<ConfirmDialog
	bind:this={newNpcDialogRef}
	title="New NPC"
	confirmLabel="Random"
	confirmClass="btn-primary"
	showCancelButton={false}
	alternateLabel="Create"
	accentColor={NPC_COLOR}
	onconfirm={() => _commitNpc(true)}
	onalternate={() => _commitNpc(false)}
	ondismiss={() => {
		_pendingNpc = null;
	}}
>
	<p
		style="font-family: var(--font-ui); font-size: 0.8rem; color: var(--text-muted); margin: 0 0 8px;"
	>
		Generate fields randomly using oracles, or create the NPC manually?
	</p>
	<fieldset style="border: none; padding: 0; margin: 0 0 4px;">
		<legend
			style="font-family: var(--font-ui); font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dimmer); margin-bottom: 5px;"
			>Name oracle</legend
		>
		{#each [{ value: 'namesIronlander', label: 'Ironlander' }, { value: 'namesIronlander2', label: 'Ironlander 2' }, { value: 'namesElf', label: 'Elf' }, { value: 'namesOther_giants', label: 'Giants' }, { value: 'namesOther_varou', label: 'Varou' }, { value: 'namesOther_trolls', label: 'Trolls' }] as opt}
			<label
				style="display: flex; align-items: center; gap: 6px; font-family: var(--font-ui); font-size: 0.78rem; color: var(--text); cursor: pointer; margin-bottom: 3px;"
			>
				<input type="radio" bind:group={_pendingNpcNameOracle} value={opt.value} />
				{opt.label}
			</label>
		{/each}
	</fieldset>
</ConfirmDialog>

<style>
	.cm-area {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}

	.cm-header {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: var(--area-header-height);
		padding: 6px 12px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-control);
		flex-shrink: 0;
	}
	.cm-title-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		color: var(--text-accent);
	}
	.cm-title-icon :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
	.cm-title-icon :global(svg) :global(path) {
		fill: currentColor;
	}
	.cmt-title {
		font-family: var(--font-display);
		font-size: calc(0.82rem * var(--font-display-scale));
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: var(--font-display-transform);
		color: var(--text-accent);
	}
	.cm-header-actions {
		display: flex;
		align-items: center;
		gap: 6px;
		flex: 1;
		justify-content: flex-end;
	}
	.cm-hdr-btn {
		font-size: 0.7rem;
		padding: 3px 9px;
		min-width: unset;
	}

	.cm-loading,
	.cm-empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		font-family: var(--font-ui);
		font-size: 0.8rem;
		color: var(--text-muted);
		padding: 20px;
		gap: 12px;
		text-align: center;
	}

	.cm-empty-icon {
		display: flex;
		width: 48px;
		height: 48px;
		opacity: 0.25;
	}
	.cm-empty-icon :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
	.cm-empty-text {
		margin: 0;
		line-height: 1.5;
		max-width: 26ch;
	}

	.cm-body {
		display: grid;
		grid-template-columns: clamp(180px, 32%, 230px) minmax(0, 1fr);
		grid-template-rows: auto 1fr;
		flex: 1;
		min-height: 0;
	}
	.cm-rail {
		grid-column: 1;
		grid-row: 1 / span 2;
		display: flex;
		flex-direction: column;
		min-height: 0;
		border-right: 1px solid var(--border);
		background: transparent;
	}
	.cm-stage-header {
		grid-column: 2;
		grid-row: 1;
	}
	.cm-stage {
		grid-column: 2;
		grid-row: 2;
		padding: 0 12px 10px 0;
		min-height: 0;
		min-width: 0;
		overflow: auto;
		display: flex;
		flex-direction: column;
	}

	/* Rail tools — search, type filter, sort. */
	.cm-rail-tools {
		display: flex;
		flex-direction: column;
		gap: 7px;
		padding: 8px;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}
	.cm-search {
		display: flex;
		align-items: center;
		gap: 6px;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 3px 8px;
	}
	.cm-search:focus-within {
		border-color: var(--text-accent);
	}
	.cm-search-icon {
		display: inline-flex;
		width: 12px;
		height: 12px;
		flex-shrink: 0;
		color: var(--text-dimmer);
	}
	.cm-search-icon :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
	.cm-search-input {
		flex: 1;
		min-width: 0;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text);
		background: transparent;
		border: none;
		outline: none;
		padding: 1px 0;
	}
	.cm-rail-filters {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	/* Type filter — "Filters ▼" toggle + drop panel, matching the foe picker. */
	.cm-filter-toggle {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 3px 10px;
		border-radius: 12px;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text-dimmer);
		cursor: pointer;
		transition:
			border-color 0.1s,
			color 0.1s;
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.cm-filter-toggle:hover,
	.cm-filter-toggle[aria-expanded='true'] {
		border-color: var(--text-muted);
		color: var(--text-muted);
	}
	.cm-filter-toggle.has-filters {
		border-color: var(--focus-ring);
		color: var(--text);
	}
	.cm-filter-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		border-radius: 8px;
		background: var(--focus-ring);
		color: var(--bg-card);
		font-size: 0.65rem;
		font-weight: 700;
		line-height: 1;
	}
	.cm-filter-panel {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px 32px 8px 10px;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 6px;
	}
	.cm-clear-btn {
		position: absolute;
		bottom: 6px;
		right: 6px;
		background: transparent;
		border: none;
		color: var(--text-dimmer);
		cursor: pointer;
		padding: 3px 4px;
		border-radius: 3px;
		display: flex;
		align-items: center;
		transition:
			color 0.12s,
			opacity 0.12s;
	}
	.cm-clear-btn:hover:not(:disabled) {
		color: var(--text);
	}
	.cm-clear-btn:disabled {
		opacity: 0.25;
		cursor: not-allowed;
	}
	.cm-clear-btn :global(svg) {
		width: 16px;
		height: 16px;
		fill: currentColor;
	}
	.cm-filter-group {
		display: flex;
		align-items: baseline;
		gap: 8px;
		min-width: 0;
	}
	.cm-filter-group-label {
		font-family: var(--font-ui);
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		flex-shrink: 0;
		width: 3.5rem;
	}
	.cm-filter-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		flex: 1;
	}
	.cm-filter-tag {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 3px 8px;
		border-radius: 12px;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text-dimmer);
		cursor: pointer;
		transition:
			background 0.1s,
			color 0.1s,
			border-color 0.1s;
	}
	.cm-filter-tag:hover {
		border-color: var(--tag-color, var(--text-dimmer));
		color: var(--tag-color, var(--text-dimmer));
	}
	.cm-filter-tag.active {
		background: color-mix(in srgb, var(--tag-color, #9ca3af) 20%, transparent);
		border-color: var(--tag-color, #9ca3af);
		color: var(--tag-color, #9ca3af);
	}
	/* Sort — single toggle flipping A–Z ⇄ recently added. */
	.cm-sort-toggle {
		all: unset;
		box-sizing: border-box;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		padding: 5px 0;
		cursor: pointer;
		color: var(--text-muted);
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 8px;
		transition: color 0.12s;
	}
	.cm-sort-toggle :global(svg) {
		width: 15px;
		height: 15px;
		fill: currentColor;
	}
	.cm-sort-toggle:hover {
		color: var(--text-accent);
	}

	/* Rail list — one row per connection. */
	.cm-list {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	.cm-row {
		all: unset;
		box-sizing: border-box;
		width: 100%;
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
		padding: 8px 9px;
		border-left: 3px solid transparent;
		transition:
			background 0.12s,
			border-color 0.12s;
	}
	.cm-row:hover {
		background: var(--bg-hover);
	}
	.cm-row--active {
		background: var(--bg-control);
		border-left-color: var(--cm-row-color, var(--text-accent));
	}
	.cm-row-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 15px;
		height: 15px;
		flex-shrink: 0;
		color: var(--cm-row-color, var(--text-muted));
	}
	.cm-row-icon :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
	.cm-row-name {
		flex: 1;
		min-width: 0;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		font-weight: 500;
		color: var(--text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cm-row--active .cm-row-name {
		color: var(--text-accent);
	}
	.cm-row-badge {
		font-family: var(--font-ui);
		font-size: 0.55rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--cm-row-color, var(--text-dimmer));
		background: color-mix(in srgb, var(--cm-row-color, var(--text-muted)) 13%, transparent);
		border-radius: 10px;
		padding: 2px 6px;
		line-height: 1;
		flex-shrink: 0;
	}
	.cm-list-empty {
		margin: 0;
		padding: 16px 12px;
		font-family: var(--font-ui);
		font-size: 0.72rem;
		color: var(--text-dimmer);
		text-align: center;
	}

	/* Toolbar back button — styled by .btn .cm-hdr-btn .back-btn (the shared
	   "← Back" style). This rule only handles its conditional visibility:
	   hidden except in the mobile single-pane drill-down (viewport ≤600px
	   while a detail entry is open; see @media). */
	.cm-header-back {
		display: none;
	}

	/* Stage banner — colored band keyed to entry type. */
	.cm-stage-header {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 5px 10px;
		background: var(--bg-control);
		border: none;
		border-left: 3px solid var(--cm-nature, var(--text-muted));
		border-bottom: 1px solid var(--border);
	}
	.cm-stage-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		color: var(--cm-nature, var(--text-muted));
	}
	.cm-stage-icon :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
	.cm-stage-name {
		appearance: none;
		-webkit-appearance: none;
		text-align: left;
		background: transparent;
		flex: 1;
		margin: 0;
		font-family: var(--font-display);
		font-size: calc(0.82rem * var(--font-display-scale));
		font-weight: var(--font-display-weight);
		font-variant: var(--font-display-variant);
		letter-spacing: 0.08em;
		text-transform: var(--font-display-transform);
		color: var(--text-accent);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cm-stage-name--editable {
		cursor: pointer;
		padding: 2px 6px;
		border: 1px solid transparent;
		border-radius: 3px;
		transition:
			background 0.12s,
			border-color 0.12s;
	}
	.cm-stage-name--editable:hover {
		background: var(--bg-hover);
		border-color: var(--border);
	}
	.cm-stage-name-input {
		flex: 1;
		font-family: var(--font-display);
		font-size: calc(0.82rem * var(--font-display-scale));
		font-weight: var(--font-display-weight);
		font-variant: var(--font-display-variant);
		letter-spacing: 0.08em;
		text-transform: var(--font-display-transform);
		color: var(--text-accent);
		background: transparent;
		border: 1px solid var(--border-mid);
		border-radius: 3px;
		padding: 2px 6px;
		outline: none;
	}
	.cm-stage-name-input:focus {
		border-color: var(--text-accent);
	}
	/* Delete: visual comes from .btn-trash in app.css; only positioning here. */
	.cm-stage-delete-btn {
		flex-shrink: 0;
	}

	.cm-tabs {
		display: flex;
		align-items: stretch;
		gap: 0;
		margin-bottom: 8px;
		border-bottom: 1px solid var(--border);
	}
	.cm-tab {
		all: unset;
		cursor: pointer;
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		padding: 7px 8px 6px;
		white-space: nowrap;
		flex-shrink: 0;
		margin-bottom: -1px;
		transition:
			color 0.12s,
			border-color 0.12s;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.cm-tab:hover {
		color: var(--text-muted);
	}
	.cm-tab--active {
		color: var(--text-accent);
		border-bottom-color: var(--text-accent);
	}

	.cm-card {
		flex: 1;
		min-height: 200px;
		background: var(--bg-inset);
		border: none;
		border-radius: 0;
		padding: 7px;
		overflow: auto;
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.cm-notes-section {
		/* flow-root contains the right-floated portrait so the section grows
		   to hold it even when the prose is short. */
		display: flow-root;
	}
	/* Description tab: let the prose wrap around the floated portrait.
	   MarkdownNotes is normally a flex column — its own block-formatting
	   context, which would sit beside the float instead of flowing around it.
	   Force normal block flow here (scoped to this section) so text wraps. */
	.cm-notes-section :global(.md-notes) {
		display: block;
	}
	/* While editing, the portrait is hidden — let the textarea fill the whole
	   panel (full width and height of the containing card). */
	.cm-notes-section--editing {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}
	.cm-notes-section--editing :global(.md-notes) {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}
	.cm-notes-section--editing :global(.md-notes-input) {
		flex: 1;
		min-height: 0;
	}

	/* Core-tab notes block — same `notes` field as the Description tab,
	   exposed at the bottom of Core for quick edits. The Description tab
	   keeps its richer view (portrait + notes wrapping around it). */
	.cm-core-notes {
		display: block;
		margin-top: 12px;
		padding-top: 10px;
		border-top: 1px solid var(--border);
	}
	/* While editing, the situational-notes block grows to fill the rest of the
	   Core panel (it's a direct flex child of .cm-card); the textarea fills it
	   with the markdown hint pinned to the bottom. */
	.cm-core-notes--editing {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}
	.cm-core-notes--editing :global(.md-notes) {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}
	.cm-core-notes--editing :global(.md-notes-input) {
		flex: 1;
		min-height: 0;
	}
	.cm-core-notes-label {
		display: block;
		margin-bottom: 4px;
	}
	.cm-field-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.cm-field-label {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-dimmer);
		min-width: 90px;
	}
	.cm-input {
		flex: 1;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text);
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 3px 8px;
		outline: none;
	}
	.cm-input:focus {
		border-color: var(--text-accent);
	}

	.cm-field-row--trouble {
		align-items: center;
	}

	.cm-dice-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		padding: 0;
		background: transparent;
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		color: var(--text-muted);
		cursor: pointer;
		flex-shrink: 0;
		transition:
			background 0.12s,
			color 0.12s,
			border-color 0.12s;
	}
	.cm-dice-btn:hover {
		background: color-mix(in srgb, var(--text-accent) 12%, transparent);
		color: var(--text-accent);
		border-color: var(--text-accent);
	}
	.cm-dice-btn :global(svg) {
		width: 16px;
		height: 16px;
		fill: currentColor;
	}

	/* Mobile (viewport-based, not container) — collapse the two panes into a
	   single-pane drill-down: the rail (list) fills the area; selecting an
	   entry swaps to the detail stage with a back button. Keyed to the
	   viewport (matching the home page's own ≤900px tabbed mode) rather than
	   the area width, because on desktop the home grid cell can be narrower
	   than a phone — a container query would wrongly hide the rail there. */
	@media (max-width: 600px) {
		.cm-body {
			display: flex;
			flex-direction: column;
		}
		.cm-rail {
			flex: 1;
			min-height: 0;
			border-right: none;
		}
		.cm-stage-header,
		.cm-stage {
			display: none;
		}
		.cm-body--detail .cm-rail {
			display: none;
		}
		.cm-body--detail .cm-stage-header {
			display: flex;
		}
		.cm-body--detail .cm-stage {
			display: flex;
			flex: 1;
			min-height: 0;
		}
		/* Back button appears on the toolbar while viewing a detail entry. */
		.cm-area--detail .cm-header-back {
			display: inline-flex;
		}
	}
</style>
